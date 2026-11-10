#!/usr/bin/env python3
"""Read-only MH11 attack facts by exact match, source player ID/name AND minutes.

Missing player action stat is NULL/unknown, never zero.
No historical Fantasy points, player minutes, or snapshots are rewritten.
"""
from __future__ import annotations
import argparse,json,time
from pathlib import Path
from datetime import datetime,timezone
from urllib.error import HTTPError,URLError
from audit_mh8_fotmob_sources import fetch_html,normalized
from probe_mh8_fotmob_structured import candidates,read_json
from extract_mh8_fotmob_advanced import explicit_attack_metrics,FIELDS
from audit_gw11_advanced_sources import verified_fixture

FIXTURES=Path("data/source-evidence/gw11-advanced-provider-candidates.json")
ROSTER=Path("data/source-evidence/gw11-scout-verified-player-identity.json")

def pick_player(target,source,used):
    # Only exact normalized names, or a PREVIOUSLY SOURCE-LINKED provider ID
    # which must still be present in the same team on this particular match.
    prior=int(target.get("known_provider_player_id") or 0)
    if prior and prior in source and prior not in used:
        return prior,"prior_source_provider_id"
    variants=set(filter(None,(normalized(target.get(k) or "") for k in
        ("full_name","display_name","short_label"))))
    matches=[pid for pid,p in source.items()
             if pid not in used and normalized(p.get("name") or "") in variants]
    if len(matches)==1:return matches[0],"exact_name_within_verified_team"
    return None,"unmatched_or_ambiguous"

def extract_fixture(data,record,roster):
    if not verified_fixture(data,record):raise ValueError("fixture/date/score mismatch")
    lineup=((data.get("content") or {}).get("lineup") or {})
    stats=((data.get("content") or {}).get("playerStats") or {})
    if not isinstance(stats,dict):raise ValueError("playerStats unavailable")
    team_maps={}
    for side,tid in [("homeTeam",record["home_team_id"]),("awayTeam",record["away_team_id"])]:
        team=lineup.get(side) or {}
        if len(team.get("starters") or [])!=11:raise ValueError("incomplete XI "+side)
        players=(team.get("starters") or [])+(team.get("subs") or [])
        team_maps[int(tid)]={int(p["id"]):p for p in players if p.get("id")}
    used={int(t):set() for t in team_maps}
    matched=[]
    missing=[]
    for row in roster:
        if int(row["match_id"])!=int(record["match_id"]):continue
        # Official 0-minute entries are NOT verified DNP merely because no
        # playerStats were present. Keep them outside advanced action corpus.
        if not row.get("minutes") or float(row["minutes"])<=0:continue
        team=int(row["team_id"])
        if team not in team_maps:
            missing.append({"player_id":row["player_id"],"reason":"team_not_in_fixture"});continue
        pid,method=pick_player(row,team_maps[team],used[team])
        if pid is None:
            from difflib import SequenceMatcher
            reference=normalized(row.get("full_name") or "")
            choices=sorted([
                {"provider_id":candidate_id,"name":source_player.get("name"),
                 "similarity":round(SequenceMatcher(None,reference,normalized(source_player.get("name") or "")).ratio(),3)}
                for candidate_id,source_player in team_maps[team].items()
                if candidate_id not in used[team]
            ],key=lambda x:x["similarity"],reverse=True)[:4]
            missing.append({"player_id":row["player_id"],"name":row["full_name"],
                            "match_id":row["match_id"],"team_id":team,
                            "reason":method,"candidate_names":choices});continue
        used[team].add(pid)
        raw=stats.get(str(pid))
        if not isinstance(raw,dict):
            missing.append({"player_id":row["player_id"],"reason":"source_playerStats_absent","provider_id":pid});continue
        stats_found=explicit_attack_metrics(raw)
        matched.append({
            "player_id":row["player_id"],"team_id":team,"match_id":record["match_id"],
            "gameweek":11,"provider_player_id":pid,"identity_method":method,
            "source_minutes_db":float(row["minutes"]),
            **{k:stats_found.get(k) for k in FIELDS}
        })
    return matched,missing

def audit(fixtures,roster):
    if fixtures["gameweek"]!=11 or roster["gameweek"]!=11:raise ValueError("wrong week")
    if len(fixtures["matches"])!=9 or len(roster["players"])!=456:
        raise ValueError("incomplete frozen source manifest")
    result=[];missing=[];verified=0
    for m in fixtures["matches"]:
        url=m["candidate_fotmob_url"].replace(
          "https://www.fotmob.com/tr/matches/","https://www.fotmob.com/matches/",1)
        try:
            html=fetch_html(url)
            for mid in candidates(html)[:5]:
                try:src=read_json(mid)
                except (HTTPError,URLError,ValueError,TimeoutError,OSError):continue
                if not verified_fixture(src,m):continue
                verified+=1
                rows,gaps=extract_fixture(src,m,roster["players"])
                result.extend(rows);missing.extend(gaps)
                break
            else:missing.append({"match_id":m["match_id"],"reason":"fixture_not_verified"})
        except (HTTPError,URLError,ValueError,TimeoutError,OSError) as exc:
            missing.append({"match_id":m["match_id"],"reason":type(exc).__name__})
        time.sleep(.7)
    expected=sum(float(x.get("minutes") or 0)>0 for x in roster["players"])
    metrics={key:sum(row[key] is not None for row in result) for key in FIELDS}
    return {
        "season":"2026-27","gameweek":11,
        "audited_at_utc":datetime.now(timezone.utc).isoformat(),
        "verified_fixtures":verified,"matched_played":len(result),
        "expected_played":expected,"unmatched_played":len(missing),
        "source_metric_coverage":metrics,"missing":missing,"rows":result,
        "zero_minute_rows_kept_out":sum(float(x.get("minutes") or 0)==0 for x in roster["players"]),
        "db_writes":0,"fantasy_points_written":0,
        "ready_for_review":verified==9 and expected==len(result) and not missing
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,default=Path("gw11-player-advanced-staging.json"))
    args=p.parse_args()
    result=audit(json.loads(FIXTURES.read_text()),json.loads(ROSTER.read_text()))
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print(f"MH11 advanced mapped {result['matched_played']}/{result['expected_played']}"
          f" verified fixtures {result['verified_fixtures']}/9, 0 min excluded {result['zero_minute_rows_kept_out']}")
    print("Source field coverage:",result["source_metric_coverage"])
    print("Unmatched samples:",result["missing"][:30])
    print("Safe for DB review:",result["ready_for_review"],"DB writes=0")

if __name__=="__main__":main()
