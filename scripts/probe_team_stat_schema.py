#!/usr/bin/env python3
"""Read-only one-match FotMob team statistics schema probe (no database writes)."""
import json
from pathlib import Path
from audit_mh8_fotmob_sources import fetch_html
from probe_mh8_fotmob_structured import candidates,read_json
from audit_gw11_advanced_sources import verified_fixture
manifest=json.loads(Path("data/source-evidence/gw8-11-team-advanced-source-manifest.json").read_text())
match=next(r for r in manifest["matches"] if r["gameweek"]==11)
url=match["candidate_fotmob_url"].replace("https://www.fotmob.com/tr/matches/","https://www.fotmob.com/matches/",1)
data=None
for mid in candidates(fetch_html(url)):
 item=read_json(mid)
 if verified_fixture(item,match):
  data=item;break
if not data: raise SystemExit("Unable to match first fixture")
stats=((data.get("content") or {}).get("stats") or {})
print("STATS_TYPE",type(stats).__name__)
print("STATS_KEYS",list(stats) if isinstance(stats,dict) else "")
print("STATS_EXCERPT",json.dumps(stats,ensure_ascii=False)[:8500])
