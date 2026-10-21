#!/usr/bin/env python3
"""Read-only MH8 source-backed attack actions. NO Fantasy points/DB writes.

Require independently reconciled FotMob-to-TFF score and FotMob-to-Scout player
identity for all nine MH8 fixtures. Missing source stats remain null (unknown).
"""
from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from probe_mh8_fotmob_structured import (
    MANIFEST, candidates, read_json, matches_tff, summarize, fetch_html,
)
from reconcile_mh8_provider_players import (
    ROSTER, OFFICIAL, REVIEWED, REVIEWED_PRIOR, reconcile,
)

EXPECTED_PLAYED = 286
METRICS = {
    "expected_goals": ("xg", "float"),
    "expected_assists": ("xa", "float"),
    "total_shots": ("shots", "int"),
    "ShotsOnTarget": ("shots_on_target", "int"),
    "chances_created": ("key_passes", "int"),
}
FIELDS = ("xg", "xa", "shots", "shots_on_target", "key_passes")


def explicit_attack_metrics(record: dict) -> dict:
    """Extract only observed scalar values from actual FotMob playerStats keys.

    Never infer a missing value from a lineup, a Fantasy score, model features,
    team totals, a player rating or the fact that another metric exists.
    """
    output = {}
    for group in record.get("stats") or []:
        items = group.get("stats") if isinstance(group, dict) else None
        if not isinstance(items, dict):
            continue
        for _, item in items.items():
            if not isinstance(item, dict):
                continue
            info = METRICS.get(item.get("key"))
            if info is None:
                continue
            field, kind = info
            statistic = item.get("stat")
            val = statistic.get("value") if isinstance(statistic, dict) else None
            if isinstance(val, bool) or not isinstance(val, (int, float)) or not math.isfinite(val):
                continue
            if val < 0 or (field in ("xg", "xa") and val > 8):
                raise ValueError("implausible numeric source value for " + field)
            if kind == "int":
                if int(val) != val or val > 35:
                    raise ValueError("noninteger or implausible action count " + field)
                val = int(val)
            else:
                val = round(float(val), 6)
            if field in output and output[field] != val:
                raise ValueError("conflicting duplicated source value " + field)
            output[field] = val
    if (output.get("shots") is not None and output.get("shots_on_target") is not None
            and output["shots_on_target"] > output["shots"]):
        raise ValueError("source shots_on_target exceeds shots")
    return output


def read_verified_fixture(record: dict) -> tuple[dict, dict]:
    last_error = None
    for attempt in range(3):
        try:
            html = fetch_html(record["candidate_fotmob_url"])
            for provider_match_id in candidates(html)[:3]:
                details = read_json(provider_match_id)
                if not matches_tff(details, record):
                    continue
                report = {
                    "fixture_id": record["match_id"],
                    "status": "STRUCTURED_FIXTURE_CONFIRMED",
                    "source_url": record["candidate_fotmob_url"],
                    "data": summarize(record, provider_match_id, details),
                }
                if not report["data"]["lineup_complete"]:
                    raise ValueError("incomplete lineup for fixture " + str(record["match_id"]))
                return report, details
            raise ValueError("no matching full-time score, teams and source match ID")
        except (OSError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError("Unverified MH8 fixture " + str(record["match_id"]) +
                       " (" + type(last_error).__name__ + ": " + str(last_error) + ")")


def build_advanced(report: dict, raw_stats_by_match: dict, roster: dict,
                   reviewed: dict, official: dict) -> dict:
    identities = reconcile(report, roster, reviewed, official)
    if (identities["source_fixtures"] != 9
            or identities["sourced_played"] != EXPECTED_PLAYED
            or identities["matched_played"] != EXPECTED_PLAYED
            or identities["unmatched_played"] != 0):
        raise ValueError("not all MH8 explicitly-played identities resolved")
    rows = []
    seen = set()
    for match in identities["matches"]:
        match_id = int(match["match_id"])
        raw = raw_stats_by_match.get(match_id)
        if not isinstance(raw, dict) or match["status"] != "STAGED_NON_FINAL":
            raise ValueError("missing verified source for match " + str(match_id))
        for observation in match["observations"]:
            if not observation["played_from_explicit_minutes"]:
                continue
            scout_id = observation["scout_player_id"]
            provider_id = observation["provider_player_id"]
            if scout_id is None or provider_id is None:
                raise ValueError("unmapped played player")
            raw_player = raw.get(str(provider_id))
            if not isinstance(raw_player, dict):
                raise ValueError("missing source playerStats for provider ID " + str(provider_id))
            key = (match_id, int(scout_id))
            if key in seen:
                raise ValueError("duplicate MH8 player")
            seen.add(key)
            values = explicit_attack_metrics(raw_player)
            rows.append({
                "gameweek": 8, "match_id": match_id, "scout_player_id": int(scout_id),
                "provider_player_id": int(provider_id),
                "player_name": observation["provider_player_name"],
                "team_id": observation["team_id"],
                "identity_method": observation["mapping_method"],
                **{k: values.get(k) for k in FIELDS},
            })
    if len(rows) != EXPECTED_PLAYED or len({x["scout_player_id"] for x in rows}) != EXPECTED_PLAYED:
        raise ValueError("MH8 player count or unique per-week identity failed")
    coverage = {metric: sum(x[metric] is not None for x in rows) for metric in FIELDS}
    if coverage["xg"] < 100 or coverage["xa"] < 100 or coverage["shots"] < 100:
        raise ValueError("unexpected lack of source attack-stat coverage " + str(coverage))
    return {
        "kind": "READ_ONLY_VERIFIED_MH8_ADVANCED_ACTIONS",
        "gameweek": 8, "season": "2026-27",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "verified_fixtures": 9, "matched_played": EXPECTED_PLAYED,
        "unmatched_played": 0, "metric_coverage": coverage,
        "source": "FotMob matchDetails full-time observed playerStats",
        "source_urls": [x["source_url"] for x in report["rows"]],
        "rows": rows, "db_writes": 0, "fantasy_points_written": 0,
        "missing_values_policy": "null means not independently observed, never convert to zero",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--roster", type=Path, default=ROSTER)
    parser.add_argument("--official", type=Path, default=OFFICIAL)
    parser.add_argument("--reviewed", type=Path, default=REVIEWED)
    parser.add_argument("--reviewed-prior", type=Path, default=REVIEWED_PRIOR)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    matches = manifest.get("matches") or []
    if (manifest.get("gameweek") != 8 or len(matches) != 9
            or len({x["match_id"] for x in matches}) != 9):
        raise ValueError("need nine unique GW8 verified match source candidates")
    read_roster = json.loads(args.roster.read_text(encoding="utf-8"))
    official = json.loads(args.official.read_text(encoding="utf-8"))
    same = json.loads(args.reviewed.read_text(encoding="utf-8"))
    prior = json.loads(args.reviewed_prior.read_text(encoding="utf-8"))
    if any(x.get("gameweek") != 8 for x in [read_roster, official, same, prior]):
        raise ValueError("MH8 source evidence version mismatch")
    reviewed = {**same, "entries": same["entries"] + prior["entries"]}

    reports, raw_by_match = [], {}
    for number, m in enumerate(matches):
        if number:
            time.sleep(1.5)
        row, details = read_verified_fixture(m)
        raw_by_match[int(m["match_id"])] = details.get("content", {}).get("playerStats", {})
        reports.append(row)
        print("VERIFIED source fixture " + str(m["match_id"]) +
              " player stats " + str(len(raw_by_match[int(m["match_id"])])), flush=True)
    artifact = build_advanced({"gameweek":8,"rows":reports}, raw_by_match,
                              read_roster, reviewed, official)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print("READ-ONLY MH8 advanced: 9 fixtures, " + str(artifact["matched_played"]) +
          " players, source metrics: " + str(artifact["metric_coverage"]) +
          ", DB writes=0, Fantasy writes=0")


if __name__ == "__main__":
    main()
