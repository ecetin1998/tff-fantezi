#!/usr/bin/env python3
"""MH9: read-only verified FotMob attacking actions; no score or DB writes.

Requires a *previously verified* nine-match source report and an exact
player-to-Scout reconciliation. Missing provider metrics stay null.
"""
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from extract_mh8_fotmob_advanced import FIELDS, explicit_attack_metrics
from probe_mh8_fotmob_structured import matches_tff, read_json

MANIFEST = Path("data/source-evidence/gw9-fotmob-match-page-candidates-2026-10-27.json")
EXPECTED = set(range(317856, 317865))


def validate_inputs(manifest: dict, report: dict, identity: dict) -> dict:
    matches = manifest.get("matches", [])
    if (manifest.get("gameweek") != 9 or report.get("gameweek") != 9 or identity.get("gameweek") != 9
            or len(matches) != 9 or {x["match_id"] for x in matches} != EXPECTED
            or report.get("structured_fixtures") != 9
            or identity.get("source_matched_fixtures") != 9
            or identity.get("roster_size") != 456 or identity.get("fixtures") != 9
            or identity.get("db_writes") != 0 or identity.get("official_fantasy_points_written") != 0):
        raise ValueError("MH9 full-source or provenance precondition failed")
    by_match = {x["fixture_id"]: x for x in report["rows"]}
    if len(by_match) != 9 or set(by_match) != EXPECTED:
        raise ValueError("Nine distinct sourced fixtures are required")
    for m in matches:
        source = by_match[m["match_id"]]
        source_detail = source.get("source_details") or {}
        if (source.get("status") != "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL"
                or not source_detail.get("fixture_verified_against_tff")
                or not source_detail.get("lineup_complete")
                or source_detail.get("fixture_id") != m["match_id"]):
            raise ValueError("Source not independently verified against fixture and lineup")
    return by_match


def extract(manifest: dict, report: dict, identity: dict, *, pause_seconds: float = 1.3, loader=read_json) -> dict:
    by_match = validate_inputs(manifest, report, identity)
    raw_by_match = {}
    for index, m in enumerate(sorted(manifest["matches"], key=lambda x: x["match_id"])):
        if index and pause_seconds:
            time.sleep(pause_seconds)
        match_id = m["match_id"]
        provider_id = by_match[match_id]["source_details"].get("fotmob_match_id")
        if not isinstance(provider_id, int) or not 100000 <= provider_id < 1_000_000_000:
            raise ValueError(f"Invalid provider fixture identity for TFF {match_id}")
        details = loader(provider_id)
        if not matches_tff(details, m):
            raise ValueError(f"Full-time fixture changed or provider ID mismatch: TFF {match_id}")
        stats = (details.get("content") or {}).get("playerStats")
        if not isinstance(stats, dict):
            raise ValueError(f"No provider playerStats dictionary for TFF {match_id}")
        raw_by_match[match_id] = stats
    source_index = {}
    for m in report["rows"]:
        match_id = m["fixture_id"]
        for p in m["source_details"]["observed_player_stat_components"]:
            key = (match_id, p["provider_id"])
            if key in source_index:
                raise ValueError("Duplicated source provider player")
            source_index[key] = p
    rows, seen, missing_source = [], set(), []
    for o in identity["source_players"]:
        if not o.get("played_explicit_minutes"):
            continue
        match_id = o["match_id"]
        pid = o["provider_player_id"]
        sid = o.get("scout_player_id")
        if sid is None:
            continue
        if (match_id, pid) not in source_index or o.get("source_name") != source_index[(match_id, pid)]["player_name"]:
            raise ValueError("MH9 source-to-Scout observed player identity changed")
        if sid in seen:
            raise ValueError("The same Scout player appeared twice in MH9 advanced extraction")
        seen.add(sid)
        raw_player = raw_by_match[match_id].get(str(pid))
        if not isinstance(raw_player, dict):
            missing_source.append({"match_id": match_id, "provider_player_id": pid, "scout_player_id": sid})
            continue
        values = explicit_attack_metrics(raw_player)
        rows.append({
            "season": "2026-27", "gameweek": 9,
            "match_id": match_id, "provider_player_id": pid, "scout_player_id": sid,
            "source_name": o["source_name"], "team_id": o["team_id"],
            "observed_minutes": o["observed_minutes"],
            "identity_method": o["identity_method"],
            **{k: values.get(k) for k in FIELDS},
        })
    if missing_source:
        raise ValueError("Some source-linked players have no provider stats record: " + json.dumps(missing_source))
    if len(rows) != identity["matched_played"] or len(rows) != len(seen):
        raise ValueError("Matched observed players not all extracted")
    coverage = {k: sum(row[k] is not None for row in rows) for k in FIELDS}
    return {
        "kind": "MH9_SOURCE_OBSERVED_ADVANCED_NONFINAL",
        "season": "2026-27", "gameweek": 9, "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "fixture_count": 9, "roster_size": 456, "matched_played": len(rows),
        "unmatched_played": identity["unmatched_played"],
        "unmatched_players": identity["unmatched_players"],
        "coverage": coverage, "source": "FotMob full-time matchDetails playerStats",
        "rows": sorted(rows, key=lambda x: (x["match_id"], x["scout_player_id"])),
        "missing_source_stats_policy": "null=unknown; no zero fill",
        "database_writes": 0, "official_fantasy_points_written": 0,
        "safe_to_close_gameweek": False, "safe_to_promote_mh10": False,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", type=Path, default=MANIFEST)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--reconciliation", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    load = lambda path: json.loads(path.read_text(encoding="utf-8"))
    result = extract(load(args.manifest), load(args.source), load(args.reconciliation))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("MH9 read-only advanced: " + str(result["matched_played"]) + " mapped, "
          + str(result["unmatched_played"]) + " unmatched, field coverage "
          + str(result["coverage"]) + "; no Fantasy points or DB writes", flush=True)


if __name__ == "__main__":
    main()
