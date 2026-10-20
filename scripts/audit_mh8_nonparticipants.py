#!/usr/bin/env python3
"""Read-only MH8 player participation evidence audit; NEVER assign missing minutes to zero.

A source line-up is NOT a certified appearance ledger. Unobserved minute values
must remain unknown until verified against official match/Fantasy records.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

ROSTER=Path("data/source-evidence/gw8-scout-roster-identities-2026-10-20.json")


def build(identity_report: dict, roster: dict) -> dict:
    if (identity_report.get("gameweek") != 8 or roster.get("gameweek") != 8
        or identity_report.get("source_fixtures") != 9
        or len(identity_report.get("matches", [])) != 9
        or len(roster.get("fixtures", [])) != 9
        or identity_report.get("safe_to_close_mh8") is not False
        or identity_report.get("official_fantasy_points_written") != 0):
        raise ValueError("must use nine nonfinal MH8 fixture reports")
    source_by_match = {int(f["match_id"]): f for f in identity_report["matches"]}
    fixture_by_match = {int(f["match_id"]): f for f in roster["fixtures"]}
    if len(source_by_match) != 9 or source_by_match.keys()!=fixture_by_match.keys():
        raise ValueError("fixture crosswalk must be unique and complete")
    teams = [int(f[k]) for f in fixture_by_match.values()
             for k in ("home_team_id", "away_team_id")]
    if len(set(teams)) != 18:
        raise ValueError("every MH8 side must appear in exactly one fixture")
    fixture_for_team = {int(f[k]):int(f["match_id"])
                        for f in fixture_by_match.values()
                        for k in ("home_team_id","away_team_id")}
    by_player={}
    for p in roster["players"]:
        sid=int(p["id"])
        if sid in by_player or int(p["team_id"]) not in fixture_for_team:
            raise ValueError("duplicate or out-of-fixture roster identity")
        by_player[sid]=p
    matched={}
    source_unmatched=[]
    stats_rows=0
    for mid, match in source_by_match.items():
        if match.get("status") != "STAGED_NON_FINAL":
            raise ValueError("fixture is not verified")
        for o in match["observations"]:
            stats_rows+=1
            if int(o["match_id"])!=mid or int(o["team_id"]) not in teams:
                raise ValueError("source stat fixture/team mismatch")
            if fixture_for_team[int(o["team_id"])]!=mid:
                raise ValueError("source stat assigned to wrong team fixture")
            sid=o.get("scout_player_id")
            played=o.get("played_from_explicit_minutes") is True
            metrics=o.get("source_metrics") or {}
            if played:
                mins=metrics.get("minutes_played")
                if type(mins) is not int or not 1<=mins<=130:
                    raise ValueError("played flag requires directly observed minutes")
            elif metrics.get("minutes_played") is not None:
                raise ValueError("missing/zero minutes cannot be silently classified as nonparticipant")
            if sid is None:
                if played:
                    raise ValueError("played player identity unresolved")
                source_unmatched.append({
                    "internal_match_id":mid,"team_id":o["team_id"],
                    "provider_player_id":o["provider_player_id"],
                    "provider_name":o["provider_player_name"],
                    "source_status":"UNMATCHED_NO_EXPLICIT_MINUTES",
                })
                continue
            sid=int(sid)
            if sid not in by_player or int(by_player[sid]["team_id"])!=int(o["team_id"]):
                raise ValueError("source player roster identity/team mismatch")
            if sid in matched:
                raise ValueError("duplicate source appearance within week")
            matched[sid]={"kind":"SOURCE_PLAYED_MINUTES" if played else "LINEUP_LISTED_NO_MINUTES",
                          "observed_minutes":metrics.get("minutes_played") if played else None,
                          "provider_player_id":o["provider_player_id"],
                          "internal_match_id":mid}
    rows=[]
    for sid, player in sorted(by_player.items()):
        evidence=matched.get(sid)
        kind=evidence["kind"] if evidence else "NOT_LINKED_TO_SOURCE_LINEUP"
        # Unlinked does not mean absent; names/jerseys may be unmatched.
        rows.append({"scout_player_id":sid,"team_id":int(player["team_id"]),
                     "internal_match_id":fixture_for_team[int(player["team_id"])],
                     "source_participation":kind,
                     "observed_minutes":evidence["observed_minutes"] if evidence else None,
                     "verified_zero_minutes":False,
                     "official_fantasy_points":None,
                     "requires_official_confirmation":kind!="SOURCE_PLAYED_MINUTES"})
    counts={name:sum(x["source_participation"]==name for x in rows)
            for name in ("SOURCE_PLAYED_MINUTES","LINEUP_LISTED_NO_MINUTES","NOT_LINKED_TO_SOURCE_LINEUP")}
    if (counts["SOURCE_PLAYED_MINUTES"]!=identity_report["matched_played"]
        or counts["LINEUP_LISTED_NO_MINUTES"]+counts["NOT_LINKED_TO_SOURCE_LINEUP"]
           !=len(rows)-identity_report["matched_played"]
        or len(source_unmatched)!=stats_rows-len(matched)
        or len(source_unmatched)<identity_report["unmatched_played"]):
        raise ValueError("source coverage accounting mismatch")
    return {"kind":"MH8_NONFINAL_PARTICIPATION_EVIDENCE",
            "gameweek":8,"roster_count":len(rows),"source_lineup_player_rows":stats_rows,
            "source_linked_players":len(matched),"participation_counts":counts,
            "unresolved_source_bench_identities":source_unmatched,
            "confirmed_zero_minute_players":0,"official_fantasy_points_written":0,
            "ready_to_close":False,
            "remaining_gates":["TFF Fantasy verify nonparticipants and zero minutes",
                                "source alias resolution for unmatched bench",
                                "official bonus/final weekly player scores"],
            "rows":rows}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--identities",type=Path,required=True)
    ap.add_argument("--roster",type=Path,default=ROSTER)
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    report=build(json.loads(args.identities.read_text(encoding="utf-8")),
                 json.loads(args.roster.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("MH8 nonfinal participation coverage: "
          f"{report['roster_count']} roster; {report['participation_counts']}; "
          f"{len(report['unresolved_source_bench_identities'])} source bench IDs unresolved; "
          "zero certified nonparticipants, zero Fantasy score writes")


if __name__=="__main__":
    main()
