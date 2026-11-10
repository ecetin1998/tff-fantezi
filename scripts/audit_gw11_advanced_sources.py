#!/usr/bin/env python3
"""MH11 read-only advanced source audit. NEVER fills absent metrics with zero.

FotMob's fixture slug can silently resolve to a DIFFERENT season/match.
Verify name, final score AND UTC kickoff against closed source-frozen TFF data
before reading any player stats. No DB writes or fantasy-point calculations.
"""
from __future__ import annotations
import argparse, json, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from audit_mh8_fotmob_sources import fetch_html
from probe_mh8_fotmob_structured import candidates,read_json,matches_tff
from extract_mh8_fotmob_advanced import explicit_attack_metrics,FIELDS

MANIFEST=Path("data/source-evidence/gw11-advanced-provider-candidates.json")

def as_utc(value):
    if not isinstance(value,str) or not value:return None
    try:
        dt=datetime.fromisoformat(value.strip().replace("Z","+00:00"))
        return dt.astimezone(timezone.utc) if dt.tzinfo else None
    except ValueError:return None

def source_kickoff(data):
    general=data.get("general") or {}
    status=(data.get("header") or {}).get("status") or {}
    for raw in (general.get("matchTimeUTCDate"),general.get("matchTimeUTC"),
                status.get("utcTime"),general.get("matchDate")):
        date=as_utc(raw)
        if date:return date
    return None

def verified_fixture(data,record):
    actual=source_kickoff(data)
    expected=as_utc(record.get("kickoff_at"))
    return bool(matches_tff(data,record) and actual and expected and
        abs((actual-expected).total_seconds())<=300)

def observed(data):
    stats=((data.get("content") or {}).get("playerStats") or {})
    if not isinstance(stats,dict):return {"players":0,"observed":{k:0 for k in FIELDS}}
    counter={k:0 for k in FIELDS}
    for r in stats.values():
        if not isinstance(r,dict):continue
        values=explicit_attack_metrics(r)
        for k in FIELDS:
            if values.get(k) is not None:counter[k]+=1
    return {"players":len(stats),"observed":counter}

def audit(manifest,fetch_page=fetch_html,read_details=read_json):
    if manifest.get("season")!="2026-27" or manifest.get("gameweek") not in (10,11):
        raise ValueError("wrong season/week")
    records=manifest.get("matches") or []
    if len(records)!=9 or len({x["match_id"] for x in records})!=9:
        raise ValueError("not nine unique MH11 fixtures")
    output=[]
    for record in records:
        result={"match_id":record["match_id"],"source_url":record["candidate_fotmob_url"],
                "status":"SOURCE_UNAVAILABLE","source_match_id":None}
        try:
            original=record["candidate_fotmob_url"]
            # The legacy verified fetcher accepts only /matches/ (no /tr/).
            # The localized /tr/matches/ paths stored by official-evidence
            # reviewers refer to the same FotMob path, not a different host.
            trusted=original.replace("https://www.fotmob.com/tr/matches/","https://www.fotmob.com/matches/",1)
            html=fetch_page(trusted)
            options=candidates(html)[:5]
            for match_id in options:
                try:data=read_details(match_id)
                except (HTTPError,URLError,OSError,ValueError,TimeoutError):continue
                if not verified_fixture(data,record):continue
                content=data.get("content") or {}
                lineup=content.get("lineup") or {}
                complete=all(len((lineup.get(s) or {}).get("starters") or [])==11 for s in ("homeTeam","awayTeam"))
                metrics=observed(data)
                result.update({
                    "source_match_id":match_id,"status":"VERIFIED_FULLTIME" if complete else "LINEUP_INCOMPLETE",
                    "lineup_complete":complete,**metrics
                })
                break
            else:result["status"]="FIXTURE_ID_DATE_OR_SCORE_MISMATCH"
        except (HTTPError,URLError,OSError,ValueError,TimeoutError) as e:
            result["error_type"]=type(e).__name__
        output.append(result)
        time.sleep(1)
    verified=sum(row["status"]=="VERIFIED_FULLTIME" for row in output)
    return {
        "season":"2026-27","gameweek":manifest["gameweek"],
        "audited_at_utc":datetime.now(timezone.utc).isoformat(),
        "read_only":True,"db_writes":0,"fantasy_points_written":0,
        "verified_fixtures":verified,"expected_fixtures":9,
        "safe_to_import_advanced":verified==9 and all(
            row.get("observed",{}).get("shots",0)>0 for row in output),
        "rows":output
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--manifest",type=Path,default=MANIFEST)
    ap.add_argument("--output",type=Path,default=Path("gw11-advanced-audit.json"))
    args=ap.parse_args()
    output=audit(json.loads(args.manifest.read_text(encoding="utf8")))
    args.output.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    print(f"MH11 advanced source: {output['verified_fixtures']}/9 independently matched; "
          f"safe_to_import={output['safe_to_import_advanced']} DB writes=0")
    for row in output["rows"]:
        print(row["match_id"],row["status"],row.get("observed"),flush=True)

if __name__=="__main__":main()
