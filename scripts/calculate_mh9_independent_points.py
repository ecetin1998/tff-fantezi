#!/usr/bin/env python3
"""MH9 owner-requested independently calculated TFF Fantasy candidate points.

Never claims to be a TFF Fantasy official point export. Never writes to DB.
Observed player minutes are sourced; unseen players have unknown minutes, NOT a
verified zero-minute assertion. Scoring assumptions are tracked explicitly.
"""
from __future__ import annotations
import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

EXPECTED = set(range(317856, 317865))
GOAL_POINTS = {"GK": 10, "DEF": 6, "MID": 5, "FWD": 4}
CLOSURE_KIND = "independently_calculated_mh9_source_events"

def compute(source: dict, identity: dict, advanced: dict, roster: dict) -> dict:
    fixtures = roster.get("fixtures", [])
    players = roster.get("players", [])
    source_rows = source.get("rows", [])
    if (any(x.get("gameweek") != 9 for x in (source, identity, advanced, roster))
        or roster.get("count") != 456 or len(players) != 456 or
        len({x["id"] for x in players}) != 456 or
        len(fixtures) != 9 or {x["match_id"] for x in fixtures} != EXPECTED
        or len(source_rows) != 9 or {x["fixture_id"] for x in source_rows} != EXPECTED
        or identity.get("matched_played") != 282 or identity.get("explicit_minutes_count") != 284
        or identity.get("unmatched_played") != 2 or
        advanced.get("matched_played") != 282 or
        source.get("structured_fixtures") != 9):
        raise ValueError("The frozen MH9 source and roster invariants failed; not calculating points.")
    by_id = {p["id"]: p for p in players}
    fx_by_id = {f["match_id"]: f for f in fixtures}
    club_match = {}
    for f in fixtures:
        for tid in (f["home_team_id"], f["away_team_id"]):
            if tid in club_match:
                raise ValueError("Repeated MH9 club")
            club_match[tid] = f["match_id"]
    if set(club_match) != {p["team_id"] for p in players}:
        raise ValueError("18 match teams do not agree with Scout roster")
    match_sources = {s["fixture_id"]: s["source_details"] for s in source_rows}
    by_match = defaultdict(list)
    seen_players = set()
    mapped = {}
    for p in identity["source_players"]:
        if not p.get("played_explicit_minutes"):
            continue
        mid = p["match_id"]
        sid = p.get("scout_player_id")
        if sid is None:
            if (p["observed_minutes"] not in (1, 6) or
                (mid, p["provider_player_id"]) not in {(317857, 1210346), (317864, 1598775)}):
                raise ValueError("Unresolved active player could alter scores")
            continue
        if sid in seen_players or sid not in by_id or by_id[sid]["team_id"] != p["team_id"]:
            raise ValueError("MH9 Scout player identity is repeated or wrong-team")
        seen_players.add(sid)
        mapped[(mid, p["provider_player_id"])] = sid
        mins = p.get("observed_minutes")
        if type(mins) is not int or not 1 <= mins <= 130:
            raise ValueError("Played minutes must be source-observed, positive integers")
        by_match[mid].append(p)
    if len(seen_players) != 282:
        raise ValueError("Expected 282 source-verified played Scout players")

    events_by_match = defaultdict(list)
    for e in identity["source_events"]:
        events_by_match[e["match_id"]].append(e)
    all_results, match_reports = [], []
    stats_goals = stats_assists = 0
    for mid in sorted(EXPECTED):
        source_details = match_sources[mid]
        fx = fx_by_id[mid]
        if (not source_details.get("fixture_verified_against_tff") or
            not source_details.get("lineup_complete") or
            source_details.get("fixture_id") != mid):
            raise ValueError("Unconfirmed fixture/lineup: " + str(mid))
        start_ids = set()
        provider_sides = {}
        for team in source_details["teams"]:
            side = team["side"]
            starters = team.get("starters", [])
            if len(starters) != 11:
                raise ValueError("Missing confirmed starter XI")
            for row in starters:
                pid = row["provider_id"]
                start_ids.add(pid)
                provider_sides[pid] = side
            for row in team.get("subs", []):
                provider_sides[row["provider_id"]] = side
        if len(start_ids) != 22:
            raise ValueError("Starting XIs duplicate/missing")
        match_events = events_by_match[mid]
        goals = [e for e in match_events if e["type"] == "Goal"]
        # 'source_side' is the credited beneficiary even on an own goal.
        if (sum(g["source_side"] == "home" for g in goals) != fx["home_goals"] or
            sum(g["source_side"] == "away" for g in goals) != fx["away_goals"]):
            raise ValueError("Fulltime score does not match 27 source goal events")
        match_rows = []
        for p in by_match[mid]:
            sid = p["scout_player_id"]
            pos = by_id[sid]["position"]
            if pos not in GOAL_POINTS:
                raise ValueError("Unknown TFF Fantasy position")
            pid = p["provider_player_id"]
            metrics = p["observed_metrics"]
            mins = p["observed_minutes"]
            is_starter = pid in start_ids
            # Provider does not expose each participant's exact on/off minutes
            # in structured observations. These are *estimates*, never a fact.
            start, end = (0, mins) if is_starter else (max(0, 90-mins), 90)
            side = provider_sides.get(pid)
            if side not in ("home", "away"):
                raise ValueError("No provider pitch side")
            conceded = sum(g["source_side"] != side and start <= g["minute"] <= end for g in goals)
            owned = [e for e in goals if e["scout_player_id"] == sid and e["own_goal_source_flag"]]
            scored = [e for e in goals if e["scout_player_id"] == sid and not e["own_goal_source_flag"]]
            assisted = [e for e in goals if e["scout_assist_player_id"] == sid]
            cards = [e for e in match_events if e["type"] == "Card" and e["scout_player_id"] == sid]
            missed = [e for e in match_events if e["type"] == "MissedPenalty" and e["scout_player_id"] == sid]
            g, a = len(scored), len(assisted)
            if ("goals" in metrics and metrics["goals"] != g) or ("assists" in metrics and metrics["assists"] != a):
                raise ValueError(f"Goal/assist source disagree for TFF match={mid} scout_player={sid}")
            stats_goals += g
            stats_assists += a
            save_value = metrics.get("saves") if pos == "GK" else None
            if pos == "GK" and (type(save_value) is not int or save_value < 0):
                raise ValueError(f"Keeper {sid} missing explicit save count")
            yellows = sum(e["source_card_color"] == "Yellow" for e in cards)
            second_yellow_red = sum(e["source_card_color"] == "YellowRed" for e in cards)
            other_red = sum(e["source_card_color"] == "Red" for e in cards)
            if any(e["source_card_color"] not in ("Yellow", "YellowRed", "Red") for e in cards):
                raise ValueError("Unknown card color")
            # A second-yellow event represents the dismissal (-3); charge the
            # earlier Yellow only once. Do not charge YellowRed twice.
            saved_pen = int(mid == 317861 and sid == 216)
            if saved_pen and (pos != "GK" or mins < 75):
                raise ValueError("Bahadır penalty save is not supported by appearance")
            parts = {
                "appearance": 2 if mins > 60 else 1,
                "goals": g * GOAL_POINTS[pos],
                "assists": a * 3,
                "clean_sheet": (4 if pos in ("GK", "DEF") else 1 if pos == "MID" else 0) if mins >= 60 and conceded == 0 else 0,
                "conceded": -(conceded // 2) if pos in ("GK", "DEF") else 0,
                "goalkeeper_saves": save_value // 3 if pos == "GK" else 0,
                "yellow": -yellows,
                "red": -(3 * (second_yellow_red + other_red)),
                "own_goals": -2 * len(owned),
                "penalty_missed": -2 * len(missed),
                "penalty_saved": 5 * saved_pen,
            }
            row = {
                "gameweek": 9, "match_id": mid, "player_id": sid,
                "full_name": by_id[sid]["full_name"], "team_id": p["team_id"], "position": pos,
                "minutes": mins, "started": is_starter, "on_pitch_estimate": [start,end],
                "goals": g, "assists": a, "yellow_cards": yellows, "red_cards": second_yellow_red + other_red,
                "own_goals": len(owned), "saves": save_value,
                "base_points": sum(parts.values()), "bonus_points": 0, "points": None,
                "components": parts, "source_method": "MH9_EXPLICIT_FOTMOB_MINUTES_EVENTS_WITH_ESTIMATED_CONCEDED_WINDOW",
                "is_official_fantasy_points": False,
            }
            match_rows.append(row)
        # Exact tied base-point groups (3/3/2 is a valid top-three pattern).
        unique_base = sorted(set(r["base_points"] for r in match_rows), reverse=True)
        if len(unique_base) < 3 or unique_base[2] < 2:
            raise ValueError(f"Cannot exclude two non-roster substitute scorers from bonus rankings, match={mid}")
        for row in match_rows:
            rank = unique_base.index(row["base_points"])
            row["bonus_points"] = 3 - rank if rank < 3 else 0
            row["points"] = row["base_points"] + row["bonus_points"]
        match_reports.append({
            "match_id": mid, "players_observed_registered": len(match_rows),
            "goals": len(goals), "own_goals": sum(e["own_goal_source_flag"] for e in goals),
            "assists": sum(e["source_assist_player_id"] is not None for e in goals),
            "cards": sum(e["type"] == "Card" for e in match_events),
            "top3_base_distinct": unique_base[:3],
            "bonus_total": sum(row["bonus_points"] for row in match_rows),
        })
        all_results.extend(match_rows)
    if (len(all_results) != 282 or sum(m["goals"] for m in match_reports) != 27 or
        stats_goals != 26 or stats_assists != 19 or
        sum(m["own_goals"] for m in match_reports) != 1 or
        sum(m["cards"] for m in match_reports) != 41):
        raise ValueError("Audited goals/assists/cards checksum mismatch")

    inferred = []
    for sid, player in by_id.items():
        if sid in seen_players:
            continue
        inferred.append({
            "gameweek": 9, "match_id": club_match[player["team_id"]],
            "player_id": sid, "full_name": player["full_name"],
            "team_id": player["team_id"], "position": player["position"],
            "minutes": None, "started": None, "on_pitch_estimate": None,
            "goals": None, "assists": None, "yellow_cards": None, "red_cards": None,
            "own_goals": None, "saves": None, "base_points": None,
            "bonus_points": None, "points": None, "components": None,
            "source_method": "NO_EXPLICIT_MH9_APPEARANCE_OBSERVATION_NOT_PROOF_OF_ZERO",
            "is_official_fantasy_points": False,
        })
    if len(inferred) != 174:
        raise ValueError("Expected exactly 174 players without source-verified appearances")
    all_results.extend(inferred)
    all_results.sort(key=lambda x: x["player_id"])
    return {
        "kind": "MH9_INDEPENDENT_SOURCE_CALCULATION_WITH_EXPLICIT_GAPS",
        "gameweek": 9, "season": "2026-27",
        "calculated_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_official_tff_fantasy_export": False, "is_fantasy_final": False,
        "can_close_gameweek": False, "can_promote_mh10": False,
        "active_players": 456, "source_observed_played": 282,
        "unresolved_source_non_roster": identity["unmatched_played"],
        "unknown_nonparticipant_status": 174,
        "match_reports": match_reports,
        "calculated_played_points_total": sum(x["points"] for x in all_results if x["points"] is not None),
        "calculated_played_bonus_total": sum(x["bonus_points"] for x in all_results if x["bonus_points"] is not None),
        "assumptions": [
            "Substitution on/off exact timestamps absent; appearances use observed minutes but conceded-window timing is ESTIMATED.",
            "174 registered players lack explicit observed positive minutes; their minutes and points stay NULL, not zero.",
            "Two source-observed players are not in the 456-player fantasy pool.",
            "75th-minute penalty saved by Bahadır Güngördü sourced from 25 Oct match report; +5 is an independent calculation, not TFF-exported points.",
            "FotMob scores and fantasyScore are never imported as TFF Fantasy actuals.",
        ],
        "rows": all_results,
        "db_writes": 0,
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--identity", required=True, type=Path)
    p.add_argument("--advanced", required=True, type=Path)
    p.add_argument("--roster", type=Path, default=Path("data/source-evidence/gw9-scout-roster-identities-2026-10-27.json"))
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    read = lambda f: json.loads(f.read_text(encoding="utf-8"))
    result = compute(read(args.source), read(args.identity), read(args.advanced), read(args.roster))
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("MH9 INDEPENDENT SOURCE CALC: " + str(result["source_observed_played"]) + " observed, "
          + str(result["unknown_nonparticipant_status"]) + " unknown, 2 non-roster, "
          + str(result["calculated_played_points_total"]) + " calculated points, "
          + str(result["calculated_played_bonus_total"]) +
          " tie-aware bonuses; cannot call Fantasy final or promote MH10.", flush=True)

if __name__ == "__main__":
    main()
