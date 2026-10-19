#!/usr/bin/env python3
"""Read-only MH8 source coverage audit. NEVER writes official Fantasy actuals.

Verifies the identity and observed full-time scoreboard of all nine candidate
FotMob public match URLs. This does not extract full-time player minutes,
goalkeeper saves or finalize bonuses. An unavailable, delayed or pre-match page
stays INCOMPLETE and remains visible in the emitted audit artifact.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

DEFAULT_MANIFEST = Path("data/source-evidence/gw8-fotmob-match-page-candidates-2026-10-20.json")


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", (value or "").replace("ı", "i"))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


ALIASES = {
    "amed": ["amed sportif", "amed sk", "amed spor"],
    "corum fk": ["corum fk", "corum", "arca corum"],
    "rizespor": ["rizespor", "caykur rizespor"],
    "basaksehir": ["basaksehir", "istanbul basaksehir"],
    "eyupspor": ["eyupspor"],
    "kasimpasa": ["kasimpasa"],
    "erzurumspor": ["erzurumspor", "erzurumspor fk"],
    "gaziantep": ["gaziantep", "gaziantep fk"],
}


def mentions_team(page: str, team: str) -> bool:
    needle = normalized(team)
    variants = ALIASES.get(needle, [needle])
    page_normalized = normalized(page)
    return any(normalized(v) in page_normalized for v in variants)


def extract_page_signals(html: str, match: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    # Ignore raw scripts; a serialized React tree containing 'Full time'
    # is NOT sufficient evidence that the rendered page has a final score.
    for node in soup(["script", "style", "noscript"]):
        node.decompose()
    page = " ".join(soup.stripped_strings)
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    summary = " ".join((title, page[:6000]))
    home_present = mentions_team(summary, match["home_team"])
    away_present = mentions_team(summary, match["away_team"])
    score_re = re.compile(
        rf"(?<!\d){int(match['home_goals'])}\s*[-–:]\s*"
        rf"{int(match['away_goals'])}(?!\d)"
    )
    fulltime = bool(re.search(r"\b(?:full\s*time|finished|bitti|beendet)\b", page, re.I))
    score_seen = bool(score_re.search(page))
    # A complete match-page status only means 'safe to inspect this page',
    # NOT that player event or score details are Fantasy-final.
    page_ready = bool(home_present and away_present and fulltime and score_seen)
    has_events = bool(re.search(r"\b(?:Events|Etkinlikler|Ereignisse)\b", page, re.I))
    has_lineup = bool(re.search(r"\b(?:Lineups|Starting XI|Ilk 11|Aufstellung)\b", page, re.I))
    return {
        "match_id": match["match_id"],
        "url": match["candidate_fotmob_url"],
        "page_state": "FULLTIME_PAGE_OBSERVED" if page_ready else "INCOMPLETE_OR_STALE_SOURCE_PAGE",
        "home_mentioned": home_present, "away_mentioned": away_present,
        "fulltime_text_seen": fulltime, "tff_score_seen": score_seen,
        "timeline_section_seen": has_events, "lineup_section_seen": has_lineup,
        "player_minutes_verified": False, "goalkeeper_saves_verified": False,
        "tff_fantasy_bonus_verified": False, "ready_to_finalize": False,
    }


def fetch_html(url: str, timeout: int = 20) -> str:
    if not url.startswith("https://www.fotmob.com/matches/"):
        raise ValueError("Non-FotMob or untrusted source URL rejected")
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; fantasy-source-audit/1.0)"})
    with urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP status {resp.status}")
        if "text/html" not in (resp.headers.get("content-type") or ""):
            raise RuntimeError("Expected HTML source; API response rejected")
        return resp.read(4_000_000).decode("utf-8", "replace")


def audit(manifest: dict, pause_seconds: float = 2.0) -> dict:
    matches = manifest.get("matches", [])
    if manifest.get("gameweek") != 8 or len(matches) != 9 or len({m["match_id"] for m in matches}) != 9:
        raise ValueError("Expected exactly 9 unique MH8 match identifiers")
    results = []
    for index, match in enumerate(matches):
        if index and pause_seconds:
            time.sleep(pause_seconds)
        try:
            html = fetch_html(match["candidate_fotmob_url"])
            result = extract_page_signals(html, match)
        except (HTTPError, URLError, TimeoutError, ValueError, OSError, RuntimeError) as exc:
            result = {"match_id": match["match_id"], "url": match["candidate_fotmob_url"],
                      "page_state": "UNAVAILABLE", "error_type": type(exc).__name__,
                      "ready_to_finalize": False}
        results.append(result)
    ready = sum(r["page_state"] == "FULLTIME_PAGE_OBSERVED" for r in results)
    return {
        "season": manifest["season"], "gameweek": 8, "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "kind": "READ_ONLY_MATCH_PAGE_COVERAGE_AUDIT",
        "fulltime_pages": ready, "fixture_pages": len(matches),
        "complete_fantasy_match_records": 0, "finalized_player_rows": 0,
        "can_close_gameweek": False, "reason": "No complete, matched minute/cards/saves and TFF Fantasy bonus ledger",
        "results": results,
    }


def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    cli.add_argument("--output", type=Path, default=Path("mh8-source-audit.json"))
    cli.add_argument("--pause-seconds", type=float, default=2)
    args = cli.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = audit(manifest, max(0, args.pause_seconds))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"MH8 source audit: {result['fulltime_pages']}/9 public FT pages; 0 finalized Fantasy matches; {args.output}")
    for row in result["results"]:
        print(f"  {row['match_id']}: {row['page_state']} {row.get('error_type','')}")
    # Source pages can be blocked or stale; report transparently in artifact.
    # Do not fail the workflow or, worse, treat missing data as observed zero.


if __name__ == "__main__":
    main()
