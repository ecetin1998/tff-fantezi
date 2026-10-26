#!/usr/bin/env python3
"""MH9 FotMob-to-Scout player crosswalk (NONFINAL, read-only).

Conservative matching on the exact current 456-player database snapshot;
never assume a missing played record or unused substitute has zero Fantasy
points. Does not grant official TFF Fantasy verification.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from reconcile_mh8_provider_players import choose_player

ROSTER = Path("data/source-evidence/gw9-scout-roster-identities-2026-10-27.json")
EXPECTED_IDS = set(range(317856, 317865))
REVIEWED = Path("data/source-evidence/gw9-reviewed-mh8-provider-player-crosswalk-2026-10-27.json")


def reconcile(report: dict, roster: dict, reviewed: dict | None = None) -> dict:
    proofs = {}
    if reviewed is not None:
        if reviewed.get("gameweek") != 9 or reviewed.get("kind") != "SCOUT_MH8_FOTMOB_PROVIDER_ID_CROSSWALK_PROOFS":
            raise ValueError("Invalid approved MH8 provider identity evidence")
        for row in reviewed.get("entries", []):
            provider_id = row.get("provider_player_id")
            if provider_id in proofs or row.get("prior_verified_gameweek") != 8 or not row.get("prior_source"):
                raise ValueError("Incomplete or repeated MH8 provider ID proof")
            proofs[provider_id] = row
    if report.get("gameweek") != 9 or roster.get("gameweek") != 9:
        raise ValueError("MH9 source and Scout roster must both be gameweek 9")
    players = roster.get("players", [])
    fixtures = roster.get("fixtures", [])
    if len(players) != 456 or len({p["id"] for p in players}) != 456:
        raise ValueError("MH9 snapshot must contain 456 distinct active players")
    if len(fixtures) != 9 or {f["match_id"] for f in fixtures} != EXPECTED_IDS:
        raise ValueError("Need nine TFF-verified fixture IDs")
    if {r.get("fixture_id") for r in report.get("rows", [])} != EXPECTED_IDS or len(report["rows"]) != 9:
        raise ValueError("Need nine unique FotMob-to-TFF-matched source fixtures")
    teams = [f[k] for f in fixtures for k in ("home_team_id", "away_team_id")]
    if len(set(teams)) != 18 or {p["team_id"] for p in players} != set(teams):
        raise ValueError("Mismatch between Scout roster and fixture clubs")
    by_team = defaultdict(list)
    for p in players:
        by_team[p["team_id"]].append(p)
    fixture_by_id = {f["match_id"]: f for f in fixtures}
    source_players, unmatched, source_events = [], [], []
    matched_ids = set()
    seen_provider = set()
    for source in sorted(report["rows"], key=lambda r: r["fixture_id"]):
        mid = source["fixture_id"]
        if source.get("status") != "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL":
            continue
        data = source.get("source_details") or {}
        if data.get("fixture_id") != mid or not data.get("lineup_complete") or not data.get("fixture_verified_against_tff"):
            raise ValueError(f"Source fixture {mid} lacks full time/lineup verification")
        fixture = fixture_by_id[mid]
        if (fixture["home_goals"], fixture["away_goals"]) != (
            sum(e.get("type") == "Goal" and e.get("is_home") is True for e in data.get("source_events", [])),
            sum(e.get("type") == "Goal" and e.get("is_home") is False for e in data.get("source_events", []))
        ):
            raise ValueError(f"Match {mid} event score disagrees with TFF result")
        provider_map = {}
        for o in data.get("observed_player_stat_components", []):
            side = o.get("side")
            if side not in ("home", "away"):
                raise ValueError("Invalid provider side")
            team_id = fixture["home_team_id"] if side == "home" else fixture["away_team_id"]
            pid = o.get("provider_id")
            if not isinstance(pid, int) or (mid, pid) in seen_provider:
                raise ValueError("Duplicated or invalid provider player ID")
            seen_provider.add((mid, pid))
            scout, method = choose_player(o, by_team[team_id])
            proof = proofs.get(pid)
            if scout is None and proof is not None:
                matches = [p for p in by_team[team_id] if p["id"] == proof["scout_player_id"]]
                if (len(matches) != 1 or proof["team_id"] != team_id
                    or proof["mh9_match_id"] != mid or proof["mh9_provider_name"] != o.get("player_name")
                    or matches[0]["full_name"] != proof["scout_full_name"]):
                    raise ValueError(f"MH8 verified provider ID proof conflicts with MH9 fixture for {pid}")
                scout, method = matches[0], "previous_week_verified_provider_id_same_team"
            minutes = (o.get("explicit_source_metrics") or {}).get("minutes_played")
            explicit_minutes = isinstance(minutes, int) and not isinstance(minutes, bool) and minutes > 0
            if scout is not None and scout["id"] in matched_ids:
                raise ValueError("Scout player identity appeared in multiple matches")
            if scout is not None:
                matched_ids.add(scout["id"])
            item = {
                "match_id": mid, "team_id": team_id, "provider_player_id": pid,
                "source_name": o.get("player_name"), "source_shirt": o.get("shirt_number"),
                "scout_player_id": scout["id"] if scout else None,
                "identity_method": method, "observed_minutes": minutes if explicit_minutes else None,
                "played_explicit_minutes": explicit_minutes,
                "observed_metrics": o.get("explicit_source_metrics") or {},
                "tff_fantasy_points": None, "fantasy_final": False,
            }
            source_players.append(item)
            provider_map[pid] = item
            if explicit_minutes and scout is None:
                unmatched.append({"match_id": mid, "team_id": team_id, "provider_id": pid,
                                  "name": o.get("player_name"), "shirt": o.get("shirt_number"), "reason": method})
        for e in data.get("source_events", []):
            scorer = provider_map.get(e.get("provider_player_id"))
            assist = provider_map.get(e.get("source_assist_provider_id"))
            source_events.append({
                "match_id": mid, "type": e.get("type"), "minute": e.get("time"),
                "source_event_id": e.get("provider_event_id"),
                "source_player_id": e.get("provider_player_id"),
                "scout_player_id": scorer["scout_player_id"] if scorer else None,
                "source_assist_player_id": e.get("source_assist_provider_id"),
                "scout_assist_player_id": assist["scout_player_id"] if assist else None,
                "own_goal_source_flag": e.get("own_goal") is True,
                "source_card_color": e.get("source_card_color"),
                "source_side": "home" if e.get("is_home") is True else "away" if e.get("is_home") is False else None,
            })
    played = [p for p in source_players if p["played_explicit_minutes"]]
    methods = Counter(p["identity_method"] for p in played)
    return {
        "gameweek": 9, "season": "2026-27",
        "kind": "MH9_SCOUT_SOURCE_MATCHES_NONFINAL",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "roster_size": len(players), "fixtures": len(fixtures),
        "source_matched_fixtures": sum(r.get("status") == "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL" for r in report["rows"]),
        "source_player_records": len(source_players),
        "explicit_minutes_count": len(played),
        "matched_played": sum(p["scout_player_id"] is not None for p in played),
        "unmatched_played": len(unmatched),
        "unmatched_players": unmatched,
        "match_methods": dict(methods),
        "source_saves_count": sum("saves" in p["observed_metrics"] for p in played),
        "source_goal_events": sum(e["type"] == "Goal" for e in source_events),
        "source_own_goal_events": sum(e["type"] == "Goal" and e["own_goal_source_flag"] for e in source_events),
        "source_card_events": sum(e["type"] == "Card" for e in source_events),
        "source_events": source_events,
        "source_players": source_players,
        "unseen_registered_players": sorted(set(p["id"] for p in players) - matched_ids),
        "missing_player_values_are_zero": False,
        "official_fantasy_points_written": 0, "db_writes": 0,
        "safe_to_close_gameweek": False, "safe_to_promote_mh10": False,
    }


def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument("--input", required=True, type=Path)
    cli.add_argument("--roster", type=Path, default=ROSTER)
    cli.add_argument("--reviewed", type=Path, default=REVIEWED)
    cli.add_argument("--output", required=True, type=Path)
    args = cli.parse_args()
    data = reconcile(json.loads(args.input.read_text(encoding="utf-8")),
                     json.loads(args.roster.read_text(encoding="utf-8")),
                     json.loads(args.reviewed.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"MH9 verified source identity candidates: {data['matched_played']}/{data['explicit_minutes_count']}"
          f"; unmatched={data['unmatched_played']}; observed saves={data['source_saves_count']}"
          "; zero official Fantasy points and DB writes", flush=True)
    for p in data["unmatched_players"]:
        print(f"  UNMATCHED TFF={p['match_id']} provider={p['provider_id']} "
              f"club={p['team_id']} name={p['name']} shirt={p['shirt']} reason={p['reason']}", flush=True)


if __name__ == "__main__":
    main()
