#!/usr/bin/env python3
"""Read-only MH9 source probe. Never imports or finalizes Fantasy actuals.

Uses the pre-existing MH8 FotMob read-only parser for current MH9 pages.
Raw provider events are discovery evidence, NOT official TFF Fantasy points.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError

from audit_mh8_fotmob_sources import fetch_html, normalized
from probe_mh8_fotmob_structured import candidates, read_json, matches_tff, summarize

MANIFEST = Path("data/source-evidence/gw9-fotmob-match-page-candidates-2026-10-27.json")
EXPECTED_MATCHES = set(range(317856, 317865))
MATCH_URL_PREFIX = "https://www.fotmob.com/matches/"


def validate_manifest(manifest: dict) -> list[dict]:
    if manifest.get("season") != "2026-27" or manifest.get("gameweek") != 9:
        raise ValueError("Wrong season or week; MH8/other periods are not MH9 evidence")
    rows = manifest.get("matches")
    if not isinstance(rows, list) or len(rows) != 9:
        raise ValueError("MH9 requires nine source candidates")
    if {r.get("match_id") for r in rows} != EXPECTED_MATCHES:
        raise ValueError("Incorrect or duplicate TFF fixture identity")
    teams = []
    for row in rows:
        mid = row["match_id"]
        if row.get("official_tff_match_id") != mid:
            raise ValueError(f"TFF source ID mismatch for fixture {mid}")
        if row.get("official_tff_url") != (
            f"https://www.tff.org/Default.aspx?macId={mid}&pageID=29"
        ):
            raise ValueError(f"Noncanonical TFF source URL for fixture {mid}")
        url = row.get("candidate_fotmob_url", "")
        if not isinstance(url, str) or not url.startswith(MATCH_URL_PREFIX):
            raise ValueError(f"Unsafe or missing FotMob candidate URL for fixture {mid}")
        if not all(isinstance(row.get(k), int) and not isinstance(row.get(k), bool)
                   and 0 <= row[k] <= 20 for k in ("home_goals", "away_goals")):
            raise ValueError(f"Missing full-time football result for fixture {mid}")
        for key in ("home_team", "away_team"):
            if not isinstance(row.get(key), str) or not normalized(row[key]):
                raise ValueError(f"Missing club for fixture {mid}")
            teams.append(normalized(row[key]))
        if row.get("verified_player_stats") is not False or row.get("verified_fantasy_points") is not False:
            raise ValueError(f"Candidate must not preclaim Fantasy/player verification: {mid}")
    if len(set(teams)) != 18:
        raise ValueError("MH9 should contain each of the 18 clubs exactly once")
    return sorted(rows, key=lambda r: r["match_id"])


def probe(manifest: dict, pause_seconds: float = 1.5) -> dict:
    fixtures = validate_manifest(manifest)
    output = []
    for index, record in enumerate(fixtures):
        if index and pause_seconds:
            time.sleep(pause_seconds)
        result = {
            "fixture_id": record["match_id"],
            "source_url": record["candidate_fotmob_url"],
            "tff_url": record["official_tff_url"],
            "status": "SOURCE_UNAVAILABLE",
            "fantasy_final": False,
            "fantasy_points": None,
            "unknown_player_stats_as_zero": False,
        }
        try:
            html = fetch_html(record["candidate_fotmob_url"])
            ids = candidates(html)
            result["embedded_candidate_count"] = len(ids)
            for fotmob_id in ids[:3]:
                try:
                    data = read_json(fotmob_id)
                except (HTTPError, URLError, OSError, TimeoutError, ValueError) as exc:
                    result["last_api_error_type"] = type(exc).__name__
                    continue
                if not matches_tff(data, record):
                    continue
                details = summarize(record, fotmob_id, data)
                if not details.get("lineup_complete"):
                    result["status"] = "MATCH_IDENTIFIED_LINEUP_INCOMPLETE"
                    result["provider_match_id"] = fotmob_id
                    break
                result["status"] = "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL"
                result["provider_match_id"] = fotmob_id
                result["source_details"] = details
                break
            if not ids:
                result["reason"] = "NO_EMBEDDED_PROVIDER_MATCH_ID"
        except (HTTPError, URLError, OSError, TimeoutError, ValueError) as exc:
            result["error_type"] = type(exc).__name__
        output.append(result)
        print(f"MH9 {record['match_id']}: {result['status']}", flush=True)
    return {
        "season": "2026-27",
        "gameweek": 9,
        "kind": "READ_ONLY_MH9_PROVIDER_OBSERVATION_CANDIDATES",
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "fixture_count": len(output),
        "structured_fixtures": sum(r["status"] == "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL" for r in output),
        "rows": output,
        "db_writes": 0,
        "official_fantasy_points_written": 0,
        "safe_to_close_gameweek": False,
        "safe_to_promote_mh10": False,
        "missing_stats_mean_zero": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--output", type=Path, default=Path("mh9-source-probe.json"))
    parser.add_argument("--offline-check", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    fixtures = validate_manifest(manifest)
    if args.offline_check:
        print(f"MH9 manifest valid: {len(fixtures)} fixtures, 18 clubs, source links pinned; DB writes=0")
        return
    report = probe(manifest)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"MH9 evidence: {report['structured_fixtures']}/9 sources matched. "
          "NO Fantasy final rows; NO database or production writes.")


if __name__ == "__main__":
    main()
