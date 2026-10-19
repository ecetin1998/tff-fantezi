#!/usr/bin/env python3
"""Read-only FotMob structured player-event discovery for MH8.

Do not equate provider rating/fantasyScore with TFF Fantasy actual points.
All results are unverified source candidates, never database final flags.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from audit_mh8_fotmob_sources import fetch_html, normalized

MANIFEST = Path("data/source-evidence/gw8-fotmob-match-page-candidates-2026-10-20.json")
PATTERN = re.compile(
    r'(?:matchId|match_id|gameId|matchID)(?:\\?"|")?\\?\s*:\s*\\?"?(\d{6,9})',
    flags=re.IGNORECASE,
)


def candidates(html: str) -> list[int]:
    # Match identity may be serialized in the page's hydrated JSON, often
    # with literal backslash-escaped quotation marks.
    raw = html.replace('\\\"', '"').replace('\\u0022', '"')
    patterns = [
        re.compile(r'["\'](?:matchId|match_id|gameId|matchID)["\']\s*:\s*["\']?(\d{6,9})', re.I),
        re.compile(r'\b(?:matchId|match_id|gameId)=([0-9]{6,9})(?![0-9])', re.I),
        re.compile(r'\/matches\/[a-z0-9-]+\/[a-z0-9]+#(\d{6,9})', re.I),
    ]
    out = []
    for regex in patterns:
        for match in regex.finditer(raw):
            value = int(match.group(1))
            if value not in out:
                out.append(value)
    return out[:5]


def read_json(match_id: int) -> dict:
    if not isinstance(match_id, int) or not 100000 <= match_id < 1_000_000_000:
        raise ValueError("invalid FotMob match ID")
    url = "https://www.fotmob.com/api/data/matchDetails?" + urlencode({"matchId": str(match_id)})
    req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urlopen(req, timeout=15) as response:
        if response.status != 200:
            raise ValueError("non-200 API response")
        if "json" not in (response.headers.get("content-type") or ""):
            raise ValueError("API response was not JSON")
        payload = json.loads(response.read(8_000_000))
        if not isinstance(payload, dict):
            raise ValueError("unexpected API top level")
        return payload


def matches_tff(data: dict, record: dict) -> bool:
    general = data.get("general") or {}
    header = data.get("header") or {}
    teams = header.get("teams") or []
    if len(teams) != 2:
        return False
    if not general.get("finished") and not (header.get("status") or {}).get("finished"):
        return False

    def team_matches(source: str, desired: str) -> bool:
        left, right = normalized(source), normalized(desired)
        aliases = {
            "amed": ("amed sportif", "amed sk"), "corum fk": ("corum fk", "corum"),
            "erzurumspor": ("erzurumspor fk", "erzurumspor"),
            "rizespor": ("caykur rizespor", "rizespor"),
            "gaziantep": ("gaziantep fk", "gaziantep"),
            "basaksehir": ("istanbul basaksehir", "basaksehir"),
        }
        return left == right or left in aliases.get(right, ()) or right in aliases.get(left, ())

    try:
        score_match = int(teams[0]["score"]) == record["home_goals"] and int(teams[1]["score"]) == record["away_goals"]
    except (KeyError, ValueError, TypeError):
        return False
    return bool(
        score_match
        and team_matches(teams[0].get("name",""), record["home_team"])
        and team_matches(teams[1].get("name",""), record["away_team"])
    )


def summarize(match: dict, provider_id: int, data: dict) -> dict:
    content = data.get("content") or {}
    lineup = content.get("lineup") or {}
    lineup_teams = [lineup.get("homeTeam") or {}, lineup.get("awayTeam") or {}]
    facts = content.get("matchFacts") or {}
    events = (facts.get("events") or {}).get("events") or []
    summary = {
        "fixture_id": match["match_id"], "fotmob_match_id": provider_id,
        "fixture_verified_against_tff": True,
        "lineup_source": lineup.get("source"), "lineup_type": lineup.get("lineupType"),
        "teams": [],
        "event_type_counts": {},
        "observed_event_count": len(events),
        "complete_minutes_verified": False,
        "all_goalkeeper_saves_verified": False,
        "tff_bonus_verified": False,
        "final_fantasy_points_written": 0,
    }
    for side, team in zip(("home", "away"), lineup_teams):
        starters = team.get("starters") or []
        subs = team.get("subs") or []
        summary["teams"].append({
            "side": side, "name": team.get("name"),
            "starters": [{"provider_id": p.get("id"), "name": p.get("name"), "position": p.get("positionId")}
                         for p in starters if isinstance(p, dict)],
            "subs": [{"provider_id": p.get("id"), "name": p.get("name"), "position": p.get("positionId")}
                     for p in subs if isinstance(p, dict)],
            "starter_count": len(starters), "sub_count": len(subs),
        })
    for ev in events:
        if isinstance(ev, dict):
            typ = str(ev.get("type") or "unknown")
            summary["event_type_counts"][typ] = summary["event_type_counts"].get(typ, 0) + 1
    stats = content.get("playerStats") or {}
    summary["player_stats_data_shape"] = list(stats.keys())[:12] if isinstance(stats, dict) else type(stats).__name__
    summary["lineup_complete"] = all(x["starter_count"] == 11 for x in summary["teams"])
    return summary


def audit(manifest: dict, match_filter: int | None = None) -> dict:
    rows = [r for r in manifest["matches"] if match_filter is None or r["match_id"] == match_filter]
    output = []
    for record in rows:
        base = {"fixture_id":record["match_id"], "source_url":record["candidate_fotmob_url"],
                "status":"NOT_VERIFIED", "fantasy_final":False}
        try:
            html = fetch_html(record["candidate_fotmob_url"])
            found = candidates(html)
            base["embedded_id_candidates"] = len(found)
            for fotmob_id in found[:3]:
                try:
                    details = read_json(fotmob_id)
                except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
                    base["last_api_error_type"] = type(exc).__name__
                    continue
                if matches_tff(details,record):
                    base["status"] = "STRUCTURED_FIXTURE_CONFIRMED"
                    base["data"] = summarize(record,fotmob_id,details)
                    break
        except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
            base["error_type"] = type(exc).__name__
            base["status"] = "SOURCE_UNAVAILABLE"
        output.append(base)
    return {
        "gameweek":8, "checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "kind":"NON_FINAL_STRUCTURED_PLAYER_EVENT_DISCOVERY",
        "covered_fixtures":len(output),
        "structured_fixture_matches":sum(x["status"]=="STRUCTURED_FIXTURE_CONFIRMED" for x in output),
        "final_fantasy_rows":0, "safe_to_close_gameweek":False, "rows":output,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", type=Path, default=MANIFEST)
    p.add_argument("--fixture-id", type=int)
    p.add_argument("--output", type=Path, default=Path("mh8-structured-source.json"))
    args = p.parse_args()
    report = audit(json.loads(args.manifest.read_text(encoding="utf-8")),args.fixture_id)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"MH8 structured source discovery: {report['structured_fixture_matches']}/{report['covered_fixtures']} verified fixture records; zero Fantasy closes")
    for x in report["rows"]:
        count = (x.get("data") or {}).get("lineup_complete")
        shapes = (x.get("data") or {}).get("player_stats_data_shape")
        print(f"  {x['fixture_id']}: {x['status']} matchIdCandidates={x.get('embedded_id_candidates')} lineup11s={count} statsShape={shapes} apiError={x.get('last_api_error_type','')}")


if __name__ == "__main__":
    main()
