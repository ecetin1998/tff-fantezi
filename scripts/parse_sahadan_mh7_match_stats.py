#!/usr/bin/env python3
"""Extract *observed* match player attack actions for 2026-27 GW7.

Source: nine Opta match IDs exposed by Mackolik/Sahadan.
Missing player actions are not fabricated: the provider's full-match pages must
be present for all nine fixtures before the caller is allowed to ingest.
"""
from __future__ import annotations

import json
import random
import sys
import time

from parse_sahadan_match_stats import fetch, norm, parse

GW = 7
MATCH_URLS = [
    (317844, "https://www.sahadan.com/mac/galatasaray-vs-kasimpasa/cmgalzgjhe6ijnsh6but6ccus/istatistikler/oyuncu"),
    (317842, "https://www.sahadan.com/mac/genclerbirligi-vs-amed-sk/cltokboun5k4k9nxr3ro0p89g/istatistikler/oyuncu"),
    (317840, "https://www.sahadan.com/mac/alanyaspor-vs-erzurumspor-fk/cl738gahh2osr45rkkmm2gx78/istatistikler/oyuncu"),
    (317846, "https://www.sahadan.com/mac/samsunspor-vs-trabzonspor/cn2vewi49kl1qhkx0311y2pzo/istatistikler/oyuncu"),
    (317841, "https://www.sahadan.com/mac/c-rizespor-vs-fenerbahce/cliahdanvjs9nziidofg11ces/istatistikler/oyuncu"),
    (317843, "https://www.sahadan.com/mac/konyaspor-vs-basaksehir/cm4vzm2f8wwko7saszh67xb84/istatistikler/oyuncu"),
    (317838, "https://www.sahadan.com/mac/gaziantep-fk-vs-corum-fk/ckkmv6s0elwnk11lvz6cmjuac/istatistikler/oyuncu"),
    (317845, "https://www.sahadan.com/mac/besiktas-vs-kocaelispor/cmritj6je4qlkxtf25mn1qdxw/istatistikler/oyuncu"),
    (317839, "https://www.sahadan.com/mac/eyupspor-vs-goztepe/ckvtcfk7n9hnrjz7wtcmkcs9g/istatistikler/oyuncu"),
]
NUMERIC = (
    "shots", "shots_on_target", "key_passes", "crosses",
    "successful_crosses", "takeons", "successful_takeons",
)

def read_match(match_id: int, url: str) -> list[dict]:
    for attempt in range(4):
        try:
            rows = parse(url, fetch(url))
            if not rows:
                raise RuntimeError("zero advanced action records: " + url)
            sides = {str(row.get("source_team_id")) for row in rows if row.get("source_team_id")}
            if len(sides) != 2:
                raise RuntimeError(f"expected two team sources, got {sorted(sides)}: {url}")
            for row in rows:
                row["source_match_id"] = match_id
            print(f"MH7 {match_id} actions={len(rows)} teams=2", file=sys.stderr)
            return rows
        except Exception as err:
            if attempt == 3:
                raise RuntimeError(f"GW7 provider extraction failed at {match_id}: {err}") from err
            time.sleep(2 ** attempt + random.uniform(0, 1))
    raise AssertionError("unreachable")

def main() -> None:
    if len({mid for mid, _ in MATCH_URLS}) != 9:
        raise RuntimeError("incomplete/duplicate GW7 match IDs")
    combined: list[dict] = []
    for mid, url in MATCH_URLS:
        combined.extend(read_match(mid, url))

    # One club plays one match per gameweek. Merge the different observed
    # action types into a single row per provider player+team.
    merged: dict[tuple[str, str], dict] = {}
    for row in combined:
        k = (norm(row["player_name"]), str(row.get("source_team_id") or ""))
        if k not in merged:
            merged[k] = {
                "player_name": row["player_name"],
                "team_name": row.get("team_name", ""),
                "source_team_id": row.get("source_team_id"),
                "source_url": row["source_url"],
                "source_match_id": row["source_match_id"],
                **{field: 0 for field in NUMERIC},
            }
        cur = merged[k]
        if cur["source_match_id"] != row["source_match_id"]:
            raise RuntimeError("same player appeared in two GW7 matches: " + row["player_name"])
        for field in NUMERIC:
            if row.get(field) is not None:
                cur[field] += int(row[field])

    rows = list(merged.values())
    if len(rows) < 70:
        raise RuntimeError(f"unlikely GW7 advanced coverage: {len(rows)} players")
    if any(
        x["shots"] < x["shots_on_target"]
        or x["crosses"] < x["successful_crosses"]
        or x["takeons"] < x["successful_takeons"]
        or max(x[field] for field in NUMERIC) > 80
        for x in rows
    ):
        raise RuntimeError("advanced field integrity check failed")

    # The nine source pages were actually fetched + parsed. Only this
    # evidence allows the ingestion service to certify source_match_count=9.
    print(json.dumps({
        "gameweek": GW,
        "source_match_count": len(MATCH_URLS),
        "matched_source_players": len(rows),
        "source_type": "Sahadan/Opta fulltime player action tabs",
        "rows": rows,
    }, ensure_ascii=False, separators=(",", ":")))

if __name__ == "__main__":
    main()
