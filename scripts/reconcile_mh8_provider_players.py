#!/usr/bin/env python3
"""Conservative, read-only MH8 provider-to-scout player identity audit.

Never upgrades FotMob values to official TFF Fantasy totals. Zero minutes,
yellow/red cards, xG and goalkeeper saves are only recorded when explicit.
Match confidence is independent of published player ratings.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from audit_mh8_fotmob_sources import normalized

ROSTER = Path("data/source-evidence/gw8-scout-roster-identities-2026-10-20.json")


def choose_player(observed: dict, team_roster: list[dict]):
    raw_name = normalized(str(observed.get("player_name") or ""))
    shirt = observed.get("shirt_number")
    if not raw_name or len(raw_name)<3:
        return None, "unresolved_empty_name"

    exact = [p for p in team_roster if raw_name in {
        normalized(p.get("full_name") or ""),
        normalized(p.get("display_name") or ""),
    }]
    if len(exact)==1:
        candidate=exact[0]
        # A one-word *display* alias is weak evidence when the registered
        # full name contains more tokens. Require a matching shirt number.
        # Actual one-word registered full names can still match exactly.
        if len(raw_name.split())==1 and normalized(candidate.get("full_name") or "")!=raw_name:
            if shirt is None or candidate.get("shirt_number") is None or str(shirt)!=str(candidate["shirt_number"]):
                return None, "single_word_alias_without_verified_shirt"
            return candidate, "single_word_display_alias_plus_shirt"
        return candidate, "exact_team_name"
    if len(exact)>1:
        narrowed = [p for p in exact if str(p.get("shirt_number"))==str(shirt) and shirt is not None]
        if len(narrowed)==1:
            return narrowed[0], "exact_team_name_jersey_tiebreak"
        return None, "ambiguous_exact"

    # Source names often omit middle/family-name suffixes used by the scout
    # roster (e.g. Romelu Lukaku vs Romelu Menama Lukaku Bolingoli).
    # Require at least TWO independently matching name tokens AND exactly
    # one player within the SAME club. Never accept overlapping first names
    # or guess an identity from an unrelated shirt number.
    name_tokens=set(raw_name.split())
    if len(name_tokens)>=2 and min(map(len,name_tokens))>=2:
        token_matches=[
            p for p in team_roster
            if name_tokens.issubset(set(normalized(p.get("full_name") or "").split()))
        ]
        if len(token_matches)==1:
            return token_matches[0], "unique_team_compound_name_tokens"
        if len(token_matches)>1:
            narrowed=[p for p in token_matches if shirt is not None
                      and str(p.get("shirt_number"))==str(shirt)]
            if len(narrowed)==1:
                return narrowed[0], "unique_compound_tokens_and_jersey"
            return None, "ambiguous_compound_name"

    # Do not match common first names or a guessed shirt number alone.
    # A source surname/compound surname can match uniquely only when both
    # the last meaningful token and the jersey number are identical.
    if shirt is not None and len(raw_name.split()[-1])>=5:
        last = raw_name.split()[-1]
        narrowed = [p for p in team_roster
            if str(p.get("shirt_number"))==str(shirt)
            and normalized(p.get("full_name") or "").split()[-1]==last]
        if len(narrowed)==1:
            return narrowed[0],"unique_team_surname_and_jersey"
    return None,"unresolved_identity"


def reconcile(source_report: dict, roster: dict) -> dict:
    fixtures={int(m["match_id"]):m for m in roster.get("fixtures",[])}
    player_by_team=defaultdict(list)
    for p in roster["players"]:
        player_by_team[int(p["team_id"])].append(p)
    if source_report.get("gameweek")!=8 or roster.get("gameweek")!=8:
        raise ValueError("MH8 gameweek match required")
    if len(source_report.get("rows",[]))!=9 or len(fixtures)!=9:
        raise ValueError("All nine matches required before player reconciliation")
    output=[]
    for match in source_report["rows"]:
        match_id=int(match["fixture_id"])
        fixture=fixtures.get(match_id)
        if fixture is None:
            raise ValueError(f"Missing TFF fixture id {match_id}")
        if match.get("status")!="STRUCTURED_FIXTURE_CONFIRMED":
            output.append({"match_id":match_id,"status":"SOURCE_NOT_VERIFIED",
                           "observations":[],"played_observed":0,
                           "matched_played":0,"unmatched_played":0})
            continue
        data=match.get("data") or {}
        observations=[]
        seen=set()
        for o in data.get("observed_player_stat_components",[]):
            side=o.get("side")
            if side not in ("home","away"):
                raise ValueError("Bad source fixture side")
            team_id=int(fixture["home_team_id"] if side=="home" else fixture["away_team_id"])
            player,method=choose_player(o,player_by_team[team_id])
            metric=o.get("explicit_source_metrics") or {}
            # A nonempty metric record with no reported minutes does not
            # establish a played player. An explicit observed zero is valid,
            # but do not invent one for unused substitutes/reserves.
            played = isinstance(metric.get("minutes_played"),int) and metric["minutes_played"]>0
            scout_id=player["id"] if player else None
            if scout_id is not None:
                if scout_id in seen:
                    scout_id=None
                    method="ambiguous_duplicate_scout_player"
                else:
                    seen.add(scout_id)
            observations.append({
                "match_id":match_id,"team_id":team_id,
                "provider_player_id":o.get("provider_id"),
                "provider_player_name":o.get("player_name"),
                "provider_shirt_number":o.get("shirt_number"),
                "scout_player_id":scout_id,"mapping_method":method,
                "played_from_explicit_minutes":played,
                "source_metrics":metric,
                "is_final_tff_fantasy":False,
            })
        played=[p for p in observations if p["played_from_explicit_minutes"]]
        matched=sum(x["scout_player_id"] is not None for x in played)
        output.append({"match_id":match_id,"status":"STAGED_NON_FINAL",
            "played_observed":len(played),"matched_played":matched,
            "unmatched_played":len(played)-matched,"observations":observations,
            "full_player_points_verified":False})
    return {"gameweek":8,"kind":"PROVIDER_PLAYER_ID_RECONCILIATION_NON_FINAL",
      "source_fixtures":len(output),
      "sourced_played":sum(x["played_observed"] for x in output),
      "matched_played":sum(x["matched_played"] for x in output),
      "unmatched_played":sum(x["unmatched_played"] for x in output),
      "official_fantasy_points_written":0,
      "safe_to_close_mh8":False,"matches":output}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--roster",type=Path,default=ROSTER)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    x=reconcile(json.loads(args.input.read_text(encoding="utf-8")),
                json.loads(args.roster.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(x,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"MH8 roster match: {x['matched_played']}/{x['sourced_played']} played players matched; "
          f"{x['unmatched_played']} unmatched (0 official Fantasy points written)")
    for match in x["matches"]:
        print(f"  {match['match_id']}: matched {match['matched_played']}/{match['played_observed']}")
        for player in match["observations"]:
            if player["played_from_explicit_minutes"] and player["scout_player_id"] is None:
                print(f"    UNMATCHED provider={player['provider_player_id']} "
                      f"name={player['provider_player_name']} club={player['team_id']} "
                      f"jersey={player['provider_shirt_number']} reason={player['mapping_method']}")


if __name__=="__main__":
    main()
