#!/usr/bin/env python3
"""Stage source-observed MH8 match events for review, never award Fantasy points."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

MANIFEST = Path("data/source-evidence/gw8-goal-penalty-event-staging-2026-10-20.json")
EVENT_TYPES = {"Goal", "Card", "MissedPenalty"}


def stage(structured: dict, identities: dict, curated: dict) -> dict:
    if any((
        structured.get("gameweek") != 8,
        identities.get("gameweek") != 8,
        curated.get("gameweek") != 8,
        structured.get("safe_to_close_gameweek") is not False,
        identities.get("safe_to_close_mh8") is not False,
        len(structured.get("rows", [])) != 9,
        len(identities.get("matches", [])) != 9,
        len(curated.get("matches", [])) != 9,
    )):
        raise ValueError("Expected exactly nine NONFINAL MH8 source fixtures")
    sources = {int(row["fixture_id"]): row for row in structured["rows"]}
    id_matches = {int(row["match_id"]): row for row in identities["matches"]}
    curated_matches = {int(row["match_id"]): row for row in curated["matches"]}
    if len(sources) != 9 or sources.keys() != id_matches.keys() or sources.keys() != curated_matches.keys():
        raise ValueError("Fixture identity/coverage mismatch")

    events, problems = [], []
    for match_id, source in sorted(sources.items()):
        observed = source.get("data") or {}
        if source.get("status") != "STRUCTURED_FIXTURE_CONFIRMED":
            raise ValueError(f"Fixture {match_id} unverified")
        curated_match = curated_matches[match_id]
        if len(curated_match.get("goals", [])) != sum(
            e.get("type") == "Goal" for e in observed.get("source_events", [])
        ):
            raise ValueError(f"Fixture {match_id} curated goal count differs from source")
        roster = {}
        for player in id_matches[match_id].get("observations", []):
            pid = player.get("provider_player_id")
            if pid is not None:
                if str(pid) in roster:
                    raise ValueError("Duplicate source player ID within fixture")
                roster[str(pid)] = player.get("scout_player_id")
        special = curated_match.get("special_events", [])
        for event in observed.get("source_events", []):
            kind = event.get("type")
            if kind not in EVENT_TYPES:
                continue
            pid = event.get("provider_player_id")
            row = {
                "internal_match_id": match_id,
                "official_tff_match_id": curated_match["official_tff_match_id"],
                "source_event_id": event.get("provider_event_id"),
                "kind": kind,
                "provider_player_id": pid,
                "provider_player_name": event.get("provider_player_name"),
                "scout_player_id": roster.get(str(pid)) if pid is not None else None,
                "source_minute": event.get("time_str"),
                "provider_own_goal": event.get("own_goal") if kind == "Goal" else None,
                "card_color": None,  # This source export does NOT provide card color.
                "tff_fantasy_points": None,
                "is_final_tff_fantasy": False,
                "requires_adjudication": True,
            }
            if kind == "MissedPenalty":
                # Curated two-source penalty-save report is only a candidate link.
                # FotMob timestamps may differ by a minute: never require equality.
                row["curated_penalty_save_candidates"] = [
                    {"taker_player_id": x.get("taker_player_id"),
                     "keeper_player_id": x.get("keeper_player_id"),
                     "source_status": x.get("status"),
                     "curated_minute": x.get("minute")}
                    for x in special if x.get("type") == "saved_penalty"
                ]
            if kind == "Goal" and any(
                g.get("fantasy_attribution") and
                g.get("fantasy_source_confirmed_by")
                for g in curated_match.get("goals", [])
            ):
                # The TFF Fantasy application can disagree with provider goal
                # attribution (e.g. own goal). Never silently choose one.
                row["has_separate_official_attribution"] = True
            if row["scout_player_id"] is None and pid is not None:
                problems.append({
                    "internal_match_id": match_id, "provider_player_id": pid,
                    "event_kind": kind, "reason": "unmatched_source_player",
                })
            events.append(row)
    counts = {kind: sum(x["kind"] == kind for x in events) for kind in sorted(EVENT_TYPES)}
    official_overrides = [{
        "internal_match_id": m["match_id"],
        "official_tff_match_id": m["official_tff_match_id"],
        "source": g["fantasy_source"],
        "attribution": g["fantasy_attribution"],
        "scout_player_id": g["scorer_id"],
        "source_conflict": g.get("news_source_conflict"),
    } for m in curated["matches"] for g in m.get("goals", [])
      if g.get("fantasy_attribution") and g.get("fantasy_source_confirmed_by")]
    return {
        "kind": "MH8_NONFINAL_EVENT_ADJUDICATION",
        "gameweek": 8,
        "fixtures_verified": 9,
        "event_counts": counts,
        "events": events,
        "unmatched_event_identities": problems,
        "separate_official_fantasy_attributions": official_overrides,
        "tff_fantasy_points_written": 0,
        "card_colors_verified": False,
        "all_assists_verified": False,
        "official_bonus_verified": False,
        "ready_to_finalize": False,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--structured", type=Path, required=True)
    p.add_argument("--identities", type=Path, required=True)
    p.add_argument("--manifest", type=Path, default=MANIFEST)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    result = stage(
        json.loads(args.structured.read_text(encoding="utf-8")),
        json.loads(args.identities.read_text(encoding="utf-8")),
        json.loads(args.manifest.read_text(encoding="utf-8")),
    )
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"MH8 nonfinal events: {result['event_counts']}; "
          f"{len(result['unmatched_event_identities'])} unresolved event identities; "
          "zero official Fantasy points written")


if __name__ == "__main__":
    main()
