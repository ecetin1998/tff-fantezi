#!/usr/bin/env python3
"""NONFINAL, source-traceable MH8 scoring components; never Fantasy totals."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

ROSTER=Path("data/source-evidence/gw8-scout-roster-identities-2026-10-20.json")
GOAL_POINTS={"GK":10,"DEF":6,"MID":5,"FWD":4}


def stage(observed, events, roster):
    if (observed.get("gameweek")!=8 or events.get("gameweek")!=8
        or roster.get("gameweek")!=8 or observed.get("verified_fixtures")!=9
        or events.get("fixtures_verified")!=9
        or observed.get("ready_to_close") is not False
        or events.get("ready_to_finalize") is not False
        or observed.get("official_player_fantasy_points_written")!=0
        or events.get("tff_fantasy_points_written")!=0):
        raise ValueError("requires complete nonfinal MH8 source coverage")
    players={int(x["id"]):x for x in roster["players"]}
    event_index=defaultdict(list)
    for e in events["events"]:
        if e.get("is_final_tff_fantasy") is not False:
            raise ValueError("provider event cannot be official final")
        if e.get("scout_player_id") is not None:
            event_index[(int(e["internal_match_id"]),int(e["scout_player_id"]))].append(e)
        if e.get("kind")=="Goal" and e.get("scout_assist_player_id") is not None:
            event_index[(int(e["internal_match_id"]),int(e["scout_assist_player_id"]))].append(
                {"kind":"ObservedAssist","source_event_id":e.get("source_event_id")})
    tff_own_goals=set()
    for e in events.get("separate_official_fantasy_attributions",[]):
        if (e.get("source")=="TFF Fantezi Lig official app (user-reported observation)"
            and e.get("attribution")=="IRFAN_CAN_EGRIBAYAT_OWN_GOAL"):
            tff_own_goals.add((int(e["internal_match_id"]),int(e["scout_player_id"])))
    rows=[]
    seen=set()
    for o in observed["matched_observations"]:
        if o.get("is_final_tff_fantasy") is not False or o.get("computed_fantasy_points") is not None:
            raise ValueError("provider points must not be used as official points")
        sid=int(o["scout_player_id"]); fixture=int(o["internal_match_id"])
        key=(fixture,sid)
        if key in seen or sid not in players or players[sid]["team_id"]!=o["team_id"]:
            raise ValueError("duplicate/invalid source identity")
        seen.add(key)
        pos=players[sid]["position"]
        if pos not in GOAL_POINTS: raise ValueError("unknown position")
        m=o["observed_metrics"]
        minutes=m.get("minutes_played")
        if type(minutes) is not int or not 1<=minutes<=130:
            raise ValueError("unknown or impossible minutes")
        for k in ("saves","goals","assists"):
            if k in m and (type(m[k]) is not int or m[k]<0):
                raise ValueError("observed stats must be nonnegative integers")
        match_events=event_index[key]
        cards=[e for e in match_events if e.get("kind")=="Card"]
        if any(e.get("card_color") not in {"Yellow","Red","SecondYellow","YellowRed"} for e in cards):
            raise ValueError("unverified card cannot be scored")
        own_goals={str(e.get("source_event_id")) for e in match_events
                   if e.get("kind")=="Goal" and e.get("provider_own_goal") is True}
        pen_misses=[e for e in match_events if e.get("kind")=="MissedPenalty"]
        components={
            "appearance":2 if minutes>60 else 1,
            "goals_provider":m["goals"]*GOAL_POINTS[pos] if "goals" in m else None,
            "assists_provider":m["assists"]*3 if "assists" in m else None,
            "keeper_saves_provider":m["saves"]//3 if pos=="GK" and "saves" in m else None,
            "card_deductions_observed":(-sum(1 if e["card_color"]=="Yellow" else 3 for e in cards)
                                          if cards else None),
            "own_goal_deductions_observed":(-2*len(own_goals) if own_goals else
                                            -2 if key in tff_own_goals else None),
            "missed_penalty_deductions_observed":(-2*len(pen_misses) if pen_misses else None),
            "clean_sheet":None,"conceded_goals":None,"penalty_save":None,
            "official_bonus":None
        }
        rows.append({"internal_match_id":fixture,"official_tff_match_id":o["official_tff_match_id"],
                     "scout_player_id":sid,"provider_player_id":o["provider_player_id"],
                     "player_name":o["scout_full_name"],"position":pos,"sourced_minutes":minutes,
                     "source_component_candidates":components,
                     "linked_source_assist_event_count":sum(e.get("kind")=="ObservedAssist" for e in match_events),
                     "tff_app_own_goal_override_present":key in tff_own_goals,
                     "computed_total_fantasy_points":None,"official_bonus_points":None,
                     "is_final_tff_fantasy":False})
    # Match aggregate source goals/assists to match-event evidence without
    # calling either provider observation a TFF Fantasy final point.
    provider_goals=sum(o["observed_metrics"]["goals"] for o in observed["matched_observations"]
                       if "goals" in o["observed_metrics"])
    provider_assists=sum(o["observed_metrics"]["assists"] for o in observed["matched_observations"]
                         if "assists" in o["observed_metrics"])
    ordinary_goals=sum(e.get("kind")=="Goal" and e.get("provider_own_goal") is not True
                       for e in events["events"])
    sourced_assists=sum(e.get("kind")=="Goal" and e.get("source_assist_provider_id") is not None
                         for e in events["events"])
    if provider_goals!=ordinary_goals or provider_assists!=sourced_assists:
        raise ValueError("source player goals/assists disagree with match event totals")
    if len(rows)!=observed.get("matched_played") or observed.get("unmatched_played")!=0:
        raise ValueError("every played player identity must be linked")
    return {"gameweek":8,"kind":"NONFINAL_PARTIAL_TFF_SCORE_COMPONENT_AUDIT",
            "source_played_count":len(rows),"events_seen":len(events["events"]),
            "ordinary_goals_reconciled":ordinary_goals,"assists_reconciled":sourced_assists,
            "official_points_written":0,"ready_to_close":False,
            "remaining_gates":["official player totals and tied 3-3-2 bonuses",
                               "clean sheets and conceded-goal timelines",
                               "penalty save and own goal adjudication",
                               "nonplaying roster verification",
                               "MH8 season totals and MH9 lifecycle QA"],
            "rows":rows}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--observed",type=Path,required=True)
    p.add_argument("--events",type=Path,required=True)
    p.add_argument("--roster",type=Path,default=ROSTER)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    result=stage(json.loads(args.observed.read_text(encoding="utf-8")),
                 json.loads(args.events.read_text(encoding="utf-8")),
                 json.loads(args.roster.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"MH8 nonfinal candidate scoring components: {result['source_played_count']} players, no Fantasy writes")


if __name__=="__main__":
    main()
