#!/usr/bin/env python3
"""Build a source-traceable, NONFINAL MH8 player-metric staging artifact.

Input: 9 FotMob pages already matched to TFF score/teams, then matched to scout
roster identities. Output is a human/audit artifact ONLY; never writes SQL,
TFF Fantasy totals, bonuses, clean-sheet points, or source-missing zeros.
"""
from __future__ import annotations
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROSTER = Path("data/source-evidence/gw8-scout-roster-identities-2026-10-20.json")
OFFICIAL = Path("data/source-evidence/gw8-scout-to-official-tff-match-identities-2026-10-20.json")
METRICS = frozenset({
    "minutes_played", "saves", "goals", "assists", "goals_conceded",
    "yellow_cards", "red_cards", "own_goals", "penalties_saved",
    "penalties_missed",
})


def build(reconciled: dict, roster: dict, official: dict) -> dict:
    if any(x.get("gameweek") != 8 for x in (reconciled, roster, official)):
        raise ValueError("Only MH8 2026-27 sourced match records are allowed")
    if reconciled.get("source_fixtures") != 9 or len(reconciled.get("matches", [])) != 9:
        raise ValueError("Expected all nine verified fixtures")
    if len(official.get("matches", [])) != 9:
        raise ValueError("Official fixture provenance incomplete")
    ids = {int(p["id"]): p for p in roster["players"]}
    valid_matches = {int(m["internal_match_id"]):m for m in official["matches"]}
    staged, unmatched, seen = [], [], set()
    per_fixture = []
    for match in reconciled["matches"]:
        match_id = int(match["match_id"])
        ref = valid_matches.get(match_id)
        if ref is None or match["status"] != "STAGED_NON_FINAL":
            raise ValueError(f"MH8 fixture {match_id} is not source-verified")
        verified = 0
        for observation in match["observations"]:
            if int(observation["match_id"]) != match_id:
                raise ValueError("player observation is in the wrong game")
            if observation.get("is_final_tff_fantasy") is not False:
                raise ValueError("untrusted source cannot mark Fantasy final")
            if not observation.get("played_from_explicit_minutes"):
                continue
            metrics = observation.get("source_metrics") or {}
            minutes = metrics.get("minutes_played")
            if type(minutes) is not int or not 1 <= minutes <= 130:
                raise ValueError("player must have explicitly observed 1..130 minutes")
            if not set(metrics).issubset(METRICS):
                raise ValueError("unexpected observed metric type")
            if any(type(v) is not int or v < 0 for v in metrics.values()):
                raise ValueError("source metric cannot be missing, fractional or negative")
            if "saves" in metrics and metrics["saves"] > 35:
                raise ValueError("implausibly high source saves; verify provider")
            player_id = observation.get("scout_player_id")
            if player_id is None:
                unmatched.append({
                    "match_id":match_id, "official_tff_match_id":ref["tff_match_id"],
                    "provider_player_id":observation.get("provider_player_id"),
                    "provider_name":observation.get("provider_player_name"),
                    "provider_shirt_number":observation.get("provider_shirt_number"),
                    "team_id":observation.get("team_id"),
                    "reason":observation.get("mapping_method"),
                    "source_metrics":metrics,
                })
                continue
            player_id=int(player_id)
            player=ids.get(player_id)
            if player is None or player["team_id"] != observation["team_id"]:
                raise ValueError("roster player does not belong to observed team")
            key=(match_id,player_id)
            if key in seen:
                raise ValueError("duplicate player identity in one fixture")
            seen.add(key)
            staged.append({
                "gameweek":8, "internal_match_id":match_id,
                "official_tff_match_id":ref["tff_match_id"],
                "scout_player_id":player_id,
                "provider_player_id":observation["provider_player_id"],
                "provider_name":observation["provider_player_name"],
                "scout_full_name":player["full_name"],
                "team_id":observation["team_id"],
                "identity_method":observation["mapping_method"],
                "observed_metrics":metrics,
                "source":"FotMob matchDetails (cross-checked to TFF match score)",
                "is_final_tff_fantasy":False,
                "computed_fantasy_points":None,
                "computed_bonus_points":None,
            })
            verified+=1
        per_fixture.append({
            "internal_match_id":match_id,"official_tff_match_id":ref["tff_match_id"],
            "matched_played":verified,
            "unmatched_played":sum(x["match_id"]==match_id for x in unmatched),
        })
    if len(staged) != reconciled.get("matched_played") or len(unmatched) != reconciled.get("unmatched_played"):
        raise ValueError("provider-to-roster reconciliation coverage changed")
    counts=Counter(key for row in staged for key in row["observed_metrics"])
    return {
        "kind":"NONFINAL_SOURCE_PLAYER_METRICS", "season":"2026-27", "gameweek":8,
        "created_at_utc":datetime.now(timezone.utc).isoformat(),
        "verified_fixtures":9, "matched_played":len(staged),
        "unmatched_played":len(unmatched), "metric_coverage":dict(counts),
        "per_fixture":per_fixture, "matched_observations":staged,
        "identity_review_queue":unmatched,
        "official_player_fantasy_points_written":0,
        "ready_to_close":False,
        "remaining_gates":["10 player identity mismatches",
            "complete non-playing player zero-minute confirmation",
            "assists, own goals and disciplinary event adjudication",
            "official TFF Fantasy 3-3-2 bonus verification",
            "match-by-match opponent clean-sheet and keeper goal-conceded reconciliation",
            "through-MH8 stats for every active roster player"],
    }


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--roster",type=Path,default=ROSTER)
    p.add_argument("--official",type=Path,default=OFFICIAL)
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    staged=build(json.loads(a.input.read_text(encoding="utf-8")),
                 json.loads(a.roster.read_text(encoding="utf-8")),
                 json.loads(a.official.read_text(encoding="utf-8")))
    a.output.write_text(json.dumps(staged,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MH8 nonfinal player metric stage: "
          f"{staged['matched_played']} matched / {staged['unmatched_played']} identity review; "
          f"observed stats {staged['metric_coverage']}; no Fantasy writes")
    for f in staged["per_fixture"]:
        print(f"  {f['internal_match_id']} official={f['official_tff_match_id']}: "
              f"{f['matched_played']} matched, {f['unmatched_played']} review")


if __name__=="__main__":
    main()
