#!/usr/bin/env python3
"""Read-only FotMob structured player-event discovery for MH8.

Do not equate provider rating/fantasyScore with TFF Fantasy actual points.
All results are unverified source candidates, never database final flags.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from audit_mh8_fotmob_sources import fetch_html, normalized

MANIFEST = Path("data/source-evidence/gw8-fotmob-match-page-candidates-2026-10-20.json")
PATTERN = re.compile(
    r'(?:matchId|match_id|gameId|matchID)(?:\\?"|")?\\?\s*:\s*\\?"?(\d{6,9})',
    flags=re.IGNORECASE,
)


def candidates(html: str) -> list[int]:
    # Match identity may be serialized in the page's hydrated JSON, often
    # with literal backslash-escaped quotation marks.
    raw = html.replace('\\\"', '"').replace('\\u0022', '"')
    patterns = [
        re.compile(r'["\'](?:matchId|match_id|gameId|matchID)["\']\s*:\s*["\']?(\d{6,9})', re.I),
        re.compile(r'\b(?:matchId|match_id|gameId)=([0-9]{6,9})(?![0-9])', re.I),
        re.compile(r'\/matches\/[a-z0-9-]+\/[a-z0-9]+#(\d{6,9})', re.I),
    ]
    out = []
    for regex in patterns:
        for match in regex.finditer(raw):
            value = int(match.group(1))
            if value not in out:
                out.append(value)
    return out[:5]


def read_json(match_id: int) -> dict:
    if not isinstance(match_id, int) or not 100000 <= match_id < 1_000_000_000:
        raise ValueError("invalid FotMob match ID")
    url = "https://www.fotmob.com/api/data/matchDetails?" + urlencode({"matchId": str(match_id)})
    req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urlopen(req, timeout=15) as response:
        if response.status != 200:
            raise ValueError("non-200 API response")
        if "json" not in (response.headers.get("content-type") or ""):
            raise ValueError("API response was not JSON")
        payload = json.loads(response.read(8_000_000))
        if not isinstance(payload, dict):
            raise ValueError("unexpected API top level")
        return payload


def matches_tff(data: dict, record: dict) -> bool:
    general = data.get("general") or {}
    header = data.get("header") or {}
    teams = header.get("teams") or []
    if len(teams) != 2:
        return False
    if not general.get("finished") and not (header.get("status") or {}).get("finished"):
        return False

    def team_matches(source: str, desired: str) -> bool:
        left, right = normalized(source), normalized(desired)
        aliases = {
            "amed": ("amed sportif", "amed sk"), "corum fk": ("corum fk", "corum"),
            "erzurumspor": ("erzurumspor fk", "erzurumspor"),
            "rizespor": ("caykur rizespor", "rizespor"),
            "gaziantep": ("gaziantep fk", "gaziantep"),
            "basaksehir": ("istanbul basaksehir", "basaksehir"),
        }
        return left == right or left in aliases.get(right, ()) or right in aliases.get(left, ())

    try:
        score_match = int(teams[0]["score"]) == record["home_goals"] and int(teams[1]["score"]) == record["away_goals"]
    except (KeyError, ValueError, TypeError):
        return False
    return bool(
        score_match
        and team_matches(teams[0].get("name",""), record["home_team"])
        and team_matches(teams[1].get("name",""), record["away_team"])
    )



# Canonical source keys must come from the provider payload, never from
# formation averages, team shots-on-target or model-generated xMinutes.
OBSERVABLE_KEYS = frozenset({
    "minutes_played", "saves", "goals", "assists", "goals_conceded",
    "yellow_cards", "red_cards", "own_goals", "penalties_saved",
    "penalties_missed",
})


def extract_explicit_stat_values(player_record: dict) -> dict:
    """Extract only scalar, nonnegative, observed integer facts.

    Expected shape: playerStats[playerId].stats[...].stats['Minutes played']
    = {"key":"minutes_played","value":90}, or a future equivalent.
    Missing is None, NOT zero; e.g. no Saves section is not 0 saves.
    """
    found = {}

    def visit(obj: object, depth: int = 0):
        if depth > 9:
            return
        if isinstance(obj, list):
            for v in obj:
                visit(v, depth+1)
            return
        if not isinstance(obj, dict):
            return

        name = str(obj.get("key") or "").casefold()
        stat_object = obj.get("stat") if isinstance(obj.get("stat"),dict) else {}
        value = obj.get("value")
        if value is None and stat_object.get("type")=="integer":
            value=stat_object.get("value")
        if name in OBSERVABLE_KEYS and name not in found:
            if isinstance(value,int) and not isinstance(value,bool) and value >= 0:
                found[name]=value
            elif isinstance(value,str) and value.isdecimal() and int(value) <= 150:
                found[name]=int(value)

        for k,v in obj.items():
            # Some provider versions use the human-readable label as the key
            # of an object holding the raw stat rather than a keyed stat item.
            canonical = normalized(str(k)).replace(" ","_")
            if canonical in OBSERVABLE_KEYS and canonical not in found:
                raw = (v.get("value") if v.get("value") is not None
                       else (v.get("stat") or {}).get("value")) if isinstance(v,dict) else v
                if isinstance(raw,int) and not isinstance(raw,bool) and raw >= 0:
                    found[canonical]=raw
                elif isinstance(raw,str) and raw.isdecimal() and int(raw) <= 150:
                    found[canonical]=int(raw)
            if k not in ("fantasyScore","Fantasy points","fantasy_points"):
                visit(v, depth+1)

    if isinstance(player_record,dict):
        visit(player_record)
    return found



def summarize(match: dict, provider_id: int, data: dict) -> dict:
    content = data.get("content") or {}
    lineup = content.get("lineup") or {}
    lineup_teams = [lineup.get("homeTeam") or {}, lineup.get("awayTeam") or {}]
    facts = content.get("matchFacts") or {}
    events = (facts.get("events") or {}).get("events") or []
    summary = {
        "fixture_id": match["match_id"], "fotmob_match_id": provider_id,
        "fixture_verified_against_tff": True,
        "lineup_source": lineup.get("source"), "lineup_type": lineup.get("lineupType"),
        "teams": [],
        "event_type_counts": {},
        "observed_event_count": len(events),
        "complete_minutes_verified": False,
        "all_goalkeeper_saves_verified": False,
        "tff_bonus_verified": False,
        "final_fantasy_points_written": 0,
    }
    # Bound the raw provider event schema preview to public, observed MH8
    # matches. We need the ACTUAL card color and assist fields before scoring.
    if match["match_id"] in (317850, 317851, 317853, 317854):
        samples = []
        for event_kind in ("Card", "Goal", "MissedPenalty"):
            observed = [e for e in events if isinstance(e, dict)
                        and e.get("type") == event_kind][:2]
            for event in observed:
                samples.append({
                    "kind": event_kind,
                    "field_names": sorted(event.keys()),
                    "raw_preview": json.dumps(event, ensure_ascii=False)[:1350],
                })
        summary["source_event_schema_diagnostic"] = samples
    for side, team in zip(("home", "away"), lineup_teams):
        starters = team.get("starters") or []
        subs = team.get("subs") or []
        summary["teams"].append({
            "side": side, "name": team.get("name"),
            "starters": [{"provider_id": p.get("id"), "name": p.get("name"), "position": p.get("positionId"), "shirt_number":p.get("shirtNumber")}
                         for p in starters if isinstance(p, dict)],
            "subs": [{"provider_id": p.get("id"), "name": p.get("name"), "position": p.get("positionId"), "shirt_number":p.get("shirtNumber")}
                     for p in subs if isinstance(p, dict)],
            "starter_count": len(starters), "sub_count": len(subs),
        })
    for ev in events:
        if isinstance(ev, dict):
            typ = str(ev.get("type") or "unknown")
            summary["event_type_counts"][typ] = summary["event_type_counts"].get(typ, 0) + 1
    stats = content.get("playerStats") or {}
    summary["player_stat_player_count"] = len(stats) if isinstance(stats, dict) else 0
    # Diagnostic-only shape preview for a bounded, public one-match sample.
    # No actual points are calculated from this sample.
    if match["match_id"]==317852 and isinstance(stats,dict) and stats:
        sample_key=next(iter(stats.keys()))
        preview=stats[sample_key]
        sample_id=summary["teams"][0]["starters"][0]["provider_id"] if summary["teams"][0]["starters"] else None
        # First key can be an UNUSED reserve with stats:[]; for diagnosing the
        # minutes/save schema choose a STARTING goalkeeper plus an actually
        # observed on-field player whose provider stats list is nonempty.
        candidates=[]
        for team in lineup_teams:
            for player in team.get("starters") or []:
                pid=player.get("id")
                row=stats.get(str(pid),{}) if isinstance(stats,dict) else {}
                if isinstance(row,dict) and row.get("stats"):
                    candidates.append((player,row))
        starting_keep=next(((p,row) for p,row in candidates if p.get("positionId")==11),None)
        outfield=next(((p,row) for p,row in candidates if p.get("positionId")!=11),None)
        summary["source_schema_diagnostic"]={
            "stat_keys_example":list(stats.keys())[:3],
            "lineup_starter_id_example":sample_id,
            "lineup_to_stat_id_match":str(sample_id) in stats,
            "first_random_player_stats_empty":not bool(preview.get("stats")) if isinstance(preview,dict) else None,
            "played_keeper_id":starting_keep[0].get("id") if starting_keep else None,
            "played_keeper_stat_preview":json.dumps(starting_keep[1],ensure_ascii=False)[:3000] if starting_keep else None,
            "played_outfield_id":outfield[0].get("id") if outfield else None,
            "played_outfield_stat_preview":json.dumps(outfield[1],ensure_ascii=False)[:1600] if outfield else None,
        }
    # Only preserve player IDs for raw source matching. Do not interpret FotMob
    # performance.fantasyScore as TFF Fantasy points or infer source minutes.
    summary["keeper_source_stat_evidence"] = []
    for team in lineup_teams:
        for p in team.get("starters") or []:
            if not isinstance(p,dict) or p.get("positionId") != 11:
                continue
            provider_id = p.get("id")
            raw_stats = stats.get(str(provider_id), {}) if isinstance(stats,dict) else {}
            summary["keeper_source_stat_evidence"].append({
                "provider_id": provider_id, "name":p.get("name"),
                "stat_record_found": bool(raw_stats),
                "top_level_stat_keys":list(raw_stats.keys())[:16] if isinstance(raw_stats,dict) else [],
                "stat_record_type":type(raw_stats).__name__,
            })
    summary["observed_player_stat_components"] = []
    if isinstance(stats,dict):
        for team in summary["teams"]:
            for player in team["starters"]+team["subs"]:
                pid=player["provider_id"]
                record=stats.get(str(pid))
                if not isinstance(record,dict):
                    continue
                explicit=extract_explicit_stat_values(record)
                summary["observed_player_stat_components"].append({
                    "provider_id":pid, "player_name":player["name"],
                    "side":team["side"],"position":player["position"],"shirt_number":player.get("shirt_number"),
                    "explicit_source_metrics":explicit,
                })
    summary["explicit_minutes_count"] = sum(
        "minutes_played" in p["explicit_source_metrics"]
        for p in summary["observed_player_stat_components"])
    summary["explicit_keeper_save_count"] = sum(
        "saves" in p["explicit_source_metrics"]
        for p in summary["observed_player_stat_components"])
    summary["lineup_complete"] = all(x["starter_count"] == 11 for x in summary["teams"])
    summary["source_events"] = [{
        "type":ev.get("type"),"time":ev.get("time"),"time_str":ev.get("timeStr"),
        "provider_event_id":ev.get("eventId"),
        "provider_player_id":(ev.get("player") or {}).get("id") if isinstance(ev.get("player"),dict) else None,
        "provider_player_name":(ev.get("player") or {}).get("name") if isinstance(ev.get("player"),dict) else None,
        "is_home":ev.get("isHome"),"own_goal":ev.get("ownGoal"),
    } for ev in events if isinstance(ev,dict)]
    return summary


def audit(manifest: dict, match_filter: int | None = None) -> dict:
    rows = [r for r in manifest["matches"] if match_filter is None or r["match_id"] == match_filter]
    output = []
    for idx, record in enumerate(rows):
        if idx:
            time.sleep(1.25)  # public site; avoid back-to-back requests
        base = {"fixture_id":record["match_id"], "source_url":record["candidate_fotmob_url"],
                "status":"NOT_VERIFIED", "fantasy_final":False}
        try:
            html = fetch_html(record["candidate_fotmob_url"])
            found = candidates(html)
            base["embedded_id_candidates"] = len(found)
            for fotmob_id in found[:3]:
                try:
                    details = read_json(fotmob_id)
                except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
                    base["last_api_error_type"] = type(exc).__name__
                    continue
                if matches_tff(details,record):
                    base["status"] = "STRUCTURED_FIXTURE_CONFIRMED"
                    base["data"] = summarize(record,fotmob_id,details)
                    break
        except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
            base["error_type"] = type(exc).__name__
            base["status"] = "SOURCE_UNAVAILABLE"
        output.append(base)
    return {
        "gameweek":8, "checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "kind":"NON_FINAL_STRUCTURED_PLAYER_EVENT_DISCOVERY",
        "covered_fixtures":len(output),
        "structured_fixture_matches":sum(x["status"]=="STRUCTURED_FIXTURE_CONFIRMED" for x in output),
        "final_fantasy_rows":0, "safe_to_close_gameweek":False, "rows":output,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", type=Path, default=MANIFEST)
    p.add_argument("--fixture-id", type=int)
    p.add_argument("--output", type=Path, default=Path("mh8-structured-source.json"))
    args = p.parse_args()
    report = audit(json.loads(args.manifest.read_text(encoding="utf-8")),args.fixture_id)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"MH8 structured source discovery: {report['structured_fixture_matches']}/{report['covered_fixtures']} verified fixture records; zero Fantasy closes")
    for x in report["rows"]:
        count = (x.get("data") or {}).get("lineup_complete")
        shapes = (x.get("data") or {}).get("player_stats_data_shape")
        keeper_count=len((x.get("data") or {}).get("keeper_source_stat_evidence",[]))
        player_count=(x.get("data") or {}).get("player_stat_player_count",0)
        event_count=(x.get("data") or {}).get("observed_event_count",0)
        minutes=(x.get("data") or {}).get("explicit_minutes_count",0)
        saves=(x.get("data") or {}).get("explicit_keeper_save_count",0)
        print(f"  {x['fixture_id']}: {x['status']} lineup11s={count} playerStatRows={player_count} sourceEvents={event_count} gkStarters={keeper_count} explicitMinutes={minutes} explicitSaves={saves} apiError={x.get('last_api_error_type','')}")
        schema=(x.get("data") or {}).get("source_schema_diagnostic")
        if schema:
            print("  SOURCE_PLAYER_STAT_SCHEMA_DIAGNOSTIC "+json.dumps(schema,ensure_ascii=False))
        event_schema=(x.get("data") or {}).get("source_event_schema_diagnostic")
        if event_schema is not None:
            print("  SOURCE_EVENT_SCHEMA_DIAGNOSTIC "+json.dumps({
                "fixture_id":x["fixture_id"],"samples":event_schema
            },ensure_ascii=False))


if __name__ == "__main__":
    main()
