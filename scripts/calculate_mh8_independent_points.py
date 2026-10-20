#!/usr/bin/env python3
"""Independently CALCULATE MH8 Fantasy points from nine source matches.

NOT an official TFF Fantezi Lig application points export. Preserve that
distinction when archiving, displaying or ingesting this calculation.
"""
from __future__ import annotations
import argparse
import json
from collections import defaultdict
from pathlib import Path

ROSTER=Path("data/source-evidence/gw8-scout-roster-identities-2026-10-20.json")
GOAL_POINTS={"GK":10,"DEF":6,"MID":5,"FWD":4}


def score(observed:dict, events:dict, structured:dict, roster:dict)->dict:
    if any((observed.get("gameweek")!=8,events.get("gameweek")!=8,
            structured.get("gameweek")!=8,roster.get("gameweek")!=8,
            observed.get("matched_played")!=286,observed.get("unmatched_played")!=0,
            observed.get("ready_to_close") is not False,
            events.get("ready_to_finalize") is not False,
            structured.get("safe_to_close_gameweek") is not False,
            len(structured.get("rows",[]))!=9,len(roster.get("fixtures",[]))!=9,
            len(roster.get("players",[]))!=456)):
        raise ValueError("requires complete MH8 source audit, NOT official final points")
    players={int(p["id"]):p for p in roster["players"]}
    fixtures={int(f["match_id"]):f for f in roster["fixtures"]}
    source={int(r["fixture_id"]):r["data"] for r in structured["rows"]}
    if len(players)!=456 or len(fixtures)!=9 or fixtures.keys()!=source.keys():
        raise ValueError("source fixture or roster identities not unique")
    by_match=defaultdict(list)
    for o in observed["matched_observations"]:
        by_match[int(o["internal_match_id"])].append(o)
    by_events=defaultdict(list)
    for e in events["events"]:
        by_events[int(e["internal_match_id"])].append(e)
    if len(by_match)!=9:raise ValueError("played fixture coverage incomplete")
    if (sum(e["kind"]=="Goal" for e in events["events"])!=23
        or sum(e["kind"]=="Card" for e in events["events"])!=31
        or sum(e["kind"]=="MissedPenalty" for e in events["events"])!=1
        or any(e["card_color"]!="Yellow" for e in events["events"] if e["kind"]=="Card")):
        raise ValueError("source event coverage differs from audited baseline")
    rows,match_summaries=[],[]
    seen=set()
    scored_goals=assists=own_goals=0
    for mid in sorted(by_match):
        fx=fixtures[mid]; data=source[mid]
        starter_provider=set();sub_provider=set();provider_side={}
        for team in data["teams"]:
            for player in team["starters"]:
                pid=int(player["provider_id"]);starter_provider.add(pid);provider_side[pid]=team["side"]
            for player in team["subs"]:
                pid=int(player["provider_id"]);sub_provider.add(pid);provider_side[pid]=team["side"]
        if len(starter_provider)!=22 or len(starter_provider&sub_provider):
            raise ValueError("invalid starting XI / substitute evidence")
        match_events=by_events[mid]
        scored_for=[]
        for e in match_events:
            if e["kind"]!="Goal":continue
            raw=next((g for g in data["source_events"] if g.get("provider_event_id")==e["source_event_id"]),None)
            if raw is None or raw["type"]!="Goal" or type(raw.get("is_home")) is not bool:
                raise ValueError("source goal event cannot be assigned to a side")
            scored_for.append(("home" if raw["is_home"] else "away",
                               int(str(e["source_minute"]).split("+")[0])))
        result_home=sum(side=="home" for side,_ in scored_for)
        result_away=sum(side=="away" for side,_ in scored_for)
        if (result_home,result_away)!=(fx["home_goals"],fx["away_goals"]):
            raise ValueError("goal chronology disagrees with independently verified match score")
        per_match=[]
        for o in by_match[mid]:
            sid=int(o["scout_player_id"]); pid=int(o["provider_player_id"])
            player=players.get(sid)
            if (not player or sid in seen or int(player["team_id"])!=int(o["team_id"])
                or player["position"] not in GOAL_POINTS
                or pid not in provider_side):
                raise ValueError("invalid player identity or duplicate")
            seen.add(sid)
            pos=player["position"];met=o["observed_metrics"]
            mins=met.get("minutes_played")
            if type(mins) is not int or not 1<=mins<=130:
                raise ValueError("played appearance requires a sourced positive integer minute")
            starter=pid in starter_provider
            begin,end=(0,mins) if starter else (90-mins,90)
            team_side=provider_side[pid]
            conceded=sum(side!=team_side and begin<=minute<=end for side,minute in scored_for)
            if pos=="GK" and conceded!=met.get("goals_conceded"):
                raise ValueError("goalkeeper match score attribution mismatch")
            g=int(met.get("goals",0));a=int(met.get("assists",0))
            if min(g,a,int(met.get("saves",0)))<0:raise ValueError("negative source stats")
            scored_goals+=g;assists+=a
            cards=[e for e in match_events if e["kind"]=="Card" and e["scout_player_id"]==sid]
            owned=[e for e in match_events if e["kind"]=="Goal" and
                   e["scout_player_id"]==sid and e["provider_own_goal"] is True]
            own_goals+=len(owned)
            missed=[e for e in match_events if e["kind"]=="MissedPenalty" and e["scout_player_id"]==sid]
            pen_saved=sum(
                c.get("keeper_player_id")==sid and c.get("source_status")=="two_source_verified"
                for e in match_events if e["kind"]=="MissedPenalty"
                for c in e.get("curated_penalty_save_candidates",[]))
            components={
                "appearance":2 if mins>60 else 1,
                "goals":g*GOAL_POINTS[pos],
                "assists":a*3,
                "keeper_saves":int(met.get("saves",0))//3 if pos=="GK" else 0,
                "clean_sheet":(4 if pos in ("GK","DEF") else 1 if pos=="MID" else 0)
                    if mins>=60 and conceded==0 else 0,
                "conceded_goals":-(conceded//2) if pos in ("GK","DEF") else 0,
                "yellow_and_red":-sum(1 if e["card_color"]=="Yellow" else 3 for e in cards),
                "own_goals":-2*len(owned),
                "missed_penalties":-2*len(missed),
                "saved_penalties":5*pen_saved
            }
            base=sum(components.values())
            row={"player_id":sid,"player_name":player["full_name"],
                 "team_id":int(player["team_id"]),"match_id":mid,"position":pos,
                 "minutes":mins,"starter":starter,"interval_estimate":[begin,end],
                 "base_points":base,"bonus_points":0,"points":base,
                 "components":components,
                 "verification_status":"INDEPENDENT_CALCULATION_NOT_OFFICIAL"}
            rows.append(row);per_match.append(row)
        ranks=sorted({r["base_points"] for r in per_match},reverse=True)
        for r in per_match:
            rank=ranks.index(r["base_points"])
            r["bonus_points"]=3-rank if rank<3 else 0
            r["points"]=r["base_points"]+r["bonus_points"]
        match_summaries.append({"match_id":mid,"home_goals":result_home,"away_goals":result_away,
                                "played_count":len(per_match),
                                "bonus_awarded_count":sum(r["bonus_points"]>0 for r in per_match)})
    if (len(seen)!=286 or scored_goals!=21 or assists!=14 or own_goals!=2
        or sum(r["components"]["saved_penalties"] for r in rows)!=5):
        raise ValueError("reconciled source goal, assist or penalty totals changed")
    # 170 others are assumed not to have appeared in this EXHAUSTIVE source.
    # Their score candidate is 0; minutes remain NULL, NEVER an officially
    # verified 0-minute assertion until an official player ledger is available.
    team_fixture={}
    for fx in roster["fixtures"]:
        for team in ("home_team_id","away_team_id"):
            if fx[team] in team_fixture:raise ValueError("duplicate fixture team")
            team_fixture[int(fx[team])]=int(fx["match_id"])
    if len(team_fixture)!=18:raise ValueError("expected eighteen team fixtures")
    for sid,player in players.items():
        if sid in seen:continue
        rows.append({"player_id":sid,"player_name":player["full_name"],
                     "team_id":int(player["team_id"]),
                     "match_id":team_fixture[int(player["team_id"])],
                     "position":player["position"],"minutes":None,
                     "base_points":0,"bonus_points":0,"points":0,
                     "components":{},
                     "verification_status":"UNPLAYED_INFERRED_SOURCE_NOT_OFFICIAL"})
    rows.sort(key=lambda r:r["player_id"])
    total=sum(r["points"] for r in rows)
    if len(rows)!=456 or total!=803:
        raise ValueError(f"source audit checksum mismatch: {len(rows)} players, {total} points")
    return {"gameweek":8,"kind":"MH8_INDEPENDENT_CALCULATED_FANTASY_POINTS",
            "is_official_tff_fantasy_point_export":False,
            "is_final_tff_fantasy":False,
            "can_advance_model_lifecycle_without_review":False,
            "rule_source":"https://tfffantezilig.com/yardim?tab=kurallar-1",
            "played_with_explicit_minutes":286,"unplayed_inferred_not_official_minutes":170,
            "source_ordinary_goals":scored_goals,"source_own_goals":own_goals,
            "source_assists":assists,"total_calculated_points":total,
            "total_bonus_points":sum(r["bonus_points"] for r in rows),
            "fixtures":match_summaries,"rows":rows}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--observed",required=True,type=Path)
    p.add_argument("--events",required=True,type=Path)
    p.add_argument("--structured",required=True,type=Path)
    p.add_argument("--roster",type=Path,default=ROSTER)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    load=lambda path:json.loads(path.read_text(encoding="utf-8"))
    result=score(load(args.observed),load(args.events),load(args.structured),load(args.roster))
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"INDEPENDENT MH8 candidate totals: 456 players, 286 observed, "
          f"{result['total_calculated_points']} points, {result['total_bonus_points']} bonuses. "
          "NOT TFF official finalized points.")


if __name__=="__main__":main()
