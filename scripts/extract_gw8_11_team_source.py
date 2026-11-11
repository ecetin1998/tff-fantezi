#!/usr/bin/env python3
"""Strict read-only FotMob fixture-verified team action metrics MH8–MH11.

Source scores, team names and UTC kickoff must match closed TFF fixtures.
Missing values stay NULL; no partial update to cumulative team totals.
"""
from __future__ import annotations
import json,time,argparse,math
from datetime import datetime,timezone
from pathlib import Path
from urllib.error import HTTPError,URLError
from audit_mh8_fotmob_sources import fetch_html
from probe_mh8_fotmob_structured import candidates,read_json
from audit_gw11_advanced_sources import verified_fixture

MANIFEST=Path("data/source-evidence/gw8-11-team-advanced-source-manifest.json")
FIELDS={
  "expected_goals":("xg","real"),
  "total_shots":("shots","int"),
  "ShotsOnTarget":("shots_on_target","int"),
  "BallPossesion":("possession_pct","real"),
  "big_chance":("big_chances","int"),
  "big_chance_missed_title":("big_chances_missed","int"),
  "touches_opp_box":("touches_in_opp_box","int"),
  "expected_goals_set_play":("set_piece_xg","real"),
  "keeper_saves":("keeper_saves","int")
}
REQUIRED=("xg","shots","shots_on_target")
def pairs(data):
  root=(((data.get("content") or {}).get("stats") or {}).get("Periods") or {}).get("All") or {}
  stack=[root];values={}
  while stack:
    item=stack.pop()
    if isinstance(item,list):
      stack.extend(item);continue
    if not isinstance(item,dict):continue
    for v in item.values():
      if isinstance(v,(list,dict)):stack.append(v)
    key=item.get("key")
    if key not in FIELDS:continue
    raw=item.get("rawStats")
    if not isinstance(raw,list) or len(raw)!=2 or any(not isinstance(x,dict) or x.get("value") is None for x in raw):continue
    name,kind=FIELDS[key]
    try: vals=tuple(float(x["value"]) for x in raw)
    except(TypeError,ValueError):continue
    if not all(math.isfinite(v) and v>=0 for v in vals):raise ValueError("invalid "+name)
    if kind=="int":
      if any(v>1000 or int(v)!=v for v in vals):raise ValueError("non-integer "+name)
      vals=tuple(int(v) for v in vals)
    elif any(v>1000 for v in vals):raise ValueError("outlier "+name)
    if name in values and values[name]!=vals:raise ValueError("conflicting "+name)
    values[name]=vals
  if all(name in values for name in REQUIRED):
    if any(a>b for a,b in zip(values["shots_on_target"],values["shots"])):
      raise ValueError("SoT > shots")
    if any(v>10 for v in values["xg"]):raise ValueError("implausible xG")
    if any(v>65 for v in values["shots"]):raise ValueError("implausible shots")
  return values

def extract(manifest,fetch_page=fetch_html,read_detail=read_json):
  rows=manifest.get("matches") or []
  if manifest.get("season")!="2026-27" or len(rows)!=36 or len({m["match_id"] for m in rows})!=36:
    raise ValueError("expected 36 TFF verified MH8–MH11 fixtures")
  output=[];failures=[]
  for record in rows:
    src=record["candidate_fotmob_url"].replace(
      "https://www.fotmob.com/tr/matches/","https://www.fotmob.com/matches/",1)
    try:
      verified=None
      for mid in candidates(fetch_page(src))[:5]:
        try:item=read_detail(mid)
        except (HTTPError,URLError,OSError,ValueError,TimeoutError):continue
        if verified_fixture(item,record):
          verified=item;break
      if verified is None:
        failures.append({"match_id":record["match_id"],"reason":"fixture_score_or_date_mismatch"});continue
      stats=pairs(verified)
      if any(k not in stats for k in REQUIRED):
        failures.append({"match_id":record["match_id"],"reason":"missing_required_team_stats",
                         "available":list(stats)});continue
      item={k:record[k] for k in ("gameweek","match_id","home_team_id","away_team_id")}
      for metric,values in stats.items():
        item["home_"+metric],item["away_"+metric]=values
      output.append(item)
    except (HTTPError,URLError,OSError,ValueError,TimeoutError) as exc:
      failures.append({"match_id":record["match_id"],"reason":type(exc).__name__})
    time.sleep(.35)
  ok=len(output)==36 and not failures
  return {"season":"2026-27","weeks":[8,9,10,11],"sources":"TFF FT fixture and FotMob matchDetails team stats",
    "audited_at_utc":datetime.now(timezone.utc).isoformat(),
    "matches":len(output),"expected_matches":36,"safe_for_review":ok,
    "no_db_writes":True,"no_fantasy_writes":True,"failures":failures,"rows":output}

def main():
  p=argparse.ArgumentParser()
  p.add_argument("--manifest",type=Path,default=MANIFEST)
  p.add_argument("--output",type=Path,default=Path("gw8-11-team-advanced-observed.json"))
  args=p.parse_args()
  report=extract(json.loads(args.manifest.read_text(encoding="utf8")))
  args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
  print(f"TEAM_SOURCE_AUDIT {report['matches']}/36 safe={report['safe_for_review']} failed={len(report['failures'])}")
  print("TEAM_STATS_JSON="+json.dumps(report,separators=(",",":"),ensure_ascii=False),flush=True)

if __name__=="__main__":main()
