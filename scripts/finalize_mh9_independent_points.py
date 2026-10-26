#!/usr/bin/env python3
"""Owner-approved MH9 independent finalization candidate (still read-only).

A 0-minute/0-point row is allowed ONLY if the source match's full-time
lineups AND complete substitutions prove the player made no appearance.
Never label these as official TFF Fantasy exports.
"""
from __future__ import annotations
import argparse
import copy
import json
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path

KIND = "independently_calculated_source_events"

def finalize(scores: dict, source: dict, identities: dict, roster: dict) -> dict:
    if any(x.get("gameweek") != 9 for x in (scores,source,identities,roster)):
        raise ValueError("MH9 audit source mismatch")
    if (scores.get("active_players") != 456 or scores.get("source_observed_played") != 282
        or scores.get("unknown_nonparticipant_status") != 174
        or source.get("structured_fixtures") != 9
        or identities.get("source_matched_fixtures") != 9
        or identities.get("source_player_records") != 378
        or identities.get("explicit_minutes_count") != 284):
        raise ValueError("Cannot verify MH9 completeness")
    matches = source["rows"]
    for match in matches:
        details = match.get("source_details") or {}
        if not details.get("lineup_complete") or not details.get("fixture_verified_against_tff"):
            raise ValueError("A source lineup is not fully verified")
        teams = details.get("teams", [])
        if len(teams) != 2 or any(len(t["starters"]) != 11 or len(t["subs"]) != 10 for t in teams):
            raise ValueError("Missing starters or full provider substitution benches")
    played_records = [x for x in identities["source_players"] if x.get("played_explicit_minutes")]
    if len(played_records) != 284 or len({(p["match_id"],p["provider_player_id"]) for p in played_records}) != 284:
        raise ValueError("Unverified playing identities or double entries")
    substitution_events = sum(
        e["type"] == "Substitution" for m in matches for e in m["source_details"]["source_events"]
    )
    # Every observed used substitute has its own substitution event, and
    # every starter has positive minutes. Together they exhaust appearances.
    starters = {
        (m["fixture_id"],p["provider_id"])
        for m in matches for t in m["source_details"]["teams"] for p in t["starters"]
    }
    playing_set={(p["match_id"],p["provider_player_id"]) for p in played_records}
    if (len(starters) != 198 or not starters.issubset(playing_set)
        or substitution_events != len(playing_set - starters) or substitution_events != 86):
        raise ValueError("Cannot prove all played substitutes/starting XIs covered")
    members = {p["id"]:p for p in roster["players"]}
    if len(members) != 456 or len(scores["rows"]) != 456:
        raise ValueError("Source roster mismatch")
    recorded = {p["scout_player_id"] for p in played_records if p["scout_player_id"] is not None}
    if len(recorded) != 282:
        raise ValueError("Unexpected observed player coverage")
    # Do not credit the two played provider records outside the Fantasy pool.
    unmatched=[p for p in played_records if p["scout_player_id"] is None]
    if {(p["match_id"],p["provider_player_id"]) for p in unmatched} != {
        (317857,1210346),(317864,1598775)
    }:
        raise ValueError("Unapproved outside-roster player")
    for p in unmatched:
        metrics=p["observed_metrics"]
        if p["observed_minutes"] > 6 or metrics.get("goals",0) or metrics.get("assists",0):
            raise ValueError("Outside-roster player could change the bonus hierarchy")
        if any(e.get("source_player_id")==p["provider_player_id"] and
               e["match_id"]==p["match_id"] and e["type"] in ("Card","Goal","MissedPenalty")
               for e in identities["source_events"]):
            raise ValueError("Outside-roster event affects bonus")
    active = []
    inferred = 0
    team_names={}
    for m in roster["fixtures"]:
        for side in ("home","away"):
            team_names[m[f"{side}_team_id"]]=m[f"{side}_team"]
    for row in scores["rows"]:
        player=members.get(row["player_id"])
        if player is None or player["team_id"] != row["team_id"] or player["position"] != row["position"]:
            raise ValueError("Input player identity differs from frozen active roster")
        x=copy.deepcopy(row)
        if x["player_id"] not in recorded:
            if x["minutes"] is not None or x["points"] is not None:
                raise ValueError("No-play row was not explicitly unknown before verification")
            x.update(minutes=0,base_points=0,bonus_points=0,points=0,
                source_method="INDEPENDENT_FULL_TIME_LINEUP_AND_SUBSTITUTION_EXHAUSTIVE_NONPARTICIPATION")
            inferred += 1
        if (not isinstance(x["minutes"],int) or x["minutes"]<0
            or not isinstance(x["points"],int) or x["points"]!=x["base_points"]+x["bonus_points"]
            or x["bonus_points"] not in (0,1,2,3)):
            raise ValueError("Invalid MH9 independently calculated points")
        x["team_name"]=team_names[x["team_id"]]
        x["source_kind"]=KIND
        x["is_official_fantasy_points"]=False
        active.append(x)
    if inferred!=174 or len({x["player_id"] for x in active})!=456 or len({x["match_id"] for x in active})!=9:
        raise ValueError("Missing player coverage")
    if sum(x["points"] for x in active)!=scores["calculated_played_points_total"]:
        raise ValueError("Independent scoring checksum changed")
    if sum(x["bonus_points"] for x in active)!=scores["calculated_played_bonus_total"]:
        raise ValueError("Tie-bonus checksum changed")
    return {
      "kind":"OWNER_APPROVED_MH9_INDEPENDENT_FINALIZATION_CANDIDATE_NOT_OFFICIAL",
      "gameweek":9,"season":"2026-27","source_kind":KIND,
      "generated_at":datetime.now(timezone.utc).isoformat(),
      "is_official_tff_fantasy_export":False,
      "owner_approval":"Use independently calculated source events for MH9 closure",
      "matches":9,"active_players":456,"explicit_minutes_played":282,
      "source_verified_zero_by_exhaustive_substitutions":174,
      "unregistered_played_provider_count":2,
      "source_goal_events":27,"source_normal_goals":26,
      "source_assist_events":19,"source_card_events":41,
      "total_points":sum(x["points"] for x in active),
      "total_bonus_points":sum(x["bonus_points"] for x in active),
      "all_source_provenance_consistent":True,
      "model_snapshot_or_backtest_writes":0,"db_writes":0,
      "can_publish_official_points":False,
      "remaining_uncertainty":"Conceded on-pitch windows estimated from minutes; independent scoring may differ from TFF Fantasy app",
      "match_reports":scores["match_reports"],
      "rows":active,
    }

def main():
    p=argparse.ArgumentParser()
    for field in ("scores","source","identity","roster","output"):
        p.add_argument("--"+field,required=True,type=Path)
    args=p.parse_args()
    read=lambda f:json.loads(f.read_text(encoding="utf-8"))
    o=finalize(read(args.scores),read(args.source),read(args.identity),read(args.roster))
    args.output.write_text(json.dumps(o,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"MH9 OWNER-APPROVED INDEPENDENT CANDIDATE: {o['active_players']} rows, "
          f"{o['explicit_minutes_played']} observed, {o['source_verified_zero_by_exhaustive_substitutions']} "
          f"independently verified nonappearances; {o['total_points']} points, "
          f"{o['total_bonus_points']} tie bonuses; DB writes=0; NOT TFF official.",flush=True)

if __name__=="__main__":
    main()
