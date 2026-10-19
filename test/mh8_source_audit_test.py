import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import audit_mh8_fotmob_sources as audit

MANIFEST = Path(__file__).resolve().parents[1] / "data/source-evidence/gw8-fotmob-match-page-candidates-2026-10-20.json"


class MH8SourceAuditTests(unittest.TestCase):
    def test_manifest_contains_all_nine_source_pages_without_fantasy_final_flag(self):
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(data["gameweek"], 8)
        self.assertEqual(len(data["matches"]), 9)
        self.assertEqual(len({x["match_id"] for x in data["matches"]}), 9)
        self.assertEqual(
            set(x["match_id"] for x in data["matches"]),
            set(range(317847, 317856)),
        )
        self.assertTrue(all(x["candidate_fotmob_url"].startswith("https://www.fotmob.com/matches/") for x in data["matches"]))
        self.assertTrue(all(not x["goalkeeper_saves_verified"] and not x["full_player_events_verified"] for x in data["matches"]))

    def test_public_full_time_page_only_qualifies_for_source_review(self):
        match = {
            "match_id": 317852, "candidate_fotmob_url": "https://www.fotmob.com/matches/kasmpasa-vs-samsunspor/1q1egc",
            "home_team": "Kasımpaşa", "away_team": "Samsunspor",
            "home_goals": 4, "away_goals": 1,
        }
        page = "<html><head><title>Kasımpaşa vs Samsunspor</title></head><body>" \
               "<div>Kasımpaşa 4 - 1 Full time Samsunspor</div>" \
               "<h2>Events</h2><h2>Lineups</h2></body></html>"
        flags = audit.extract_page_signals(page, match)
        self.assertEqual(flags["page_state"], "FULLTIME_PAGE_OBSERVED")
        self.assertTrue(flags["tff_score_seen"])
        self.assertTrue(flags["timeline_section_seen"])
        self.assertTrue(flags["lineup_section_seen"])
        self.assertFalse(flags["ready_to_finalize"])
        self.assertFalse(flags["player_minutes_verified"])
        self.assertFalse(flags["goalkeeper_saves_verified"])
        self.assertFalse(flags["tff_fantasy_bonus_verified"])

        # Pre-match page or a stale scoreboard must NEVER qualify.
        for html in [
            page.replace("Full time", "Preview"),
            page.replace("4 - 1", "1 - 0"),
            "<html><head><title>Kasımpaşa vs Samsunspor</title></head><body>"
            "<script>4 - 1 Full time</script>Lineups only</body></html>",
        ]:
            self.assertNotEqual(audit.extract_page_signals(html, match)["page_state"],
                                "FULLTIME_PAGE_OBSERVED")

    def test_turkish_club_normalization(self):
        self.assertTrue(audit.mentions_team("KASIMPASA", "Kasımpaşa"))
        self.assertTrue(audit.mentions_team("Corum FK", "Çorum FK"))
        self.assertTrue(audit.mentions_team("Amed Sportif", "Amed"))

    def test_no_conclusion_when_pages_fail(self):
        original = audit.fetch_html
        try:
            audit.fetch_html = lambda url, timeout=20: (_ for _ in ()).throw(OSError("network unavailable"))
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
            report = audit.audit(manifest, pause_seconds=0)
            self.assertEqual(report["fulltime_pages"], 0)
            self.assertEqual(report["complete_fantasy_match_records"], 0)
            self.assertEqual(report["finalized_player_rows"], 0)
            self.assertFalse(report["can_close_gameweek"])
            self.assertTrue(all(x["page_state"] == "UNAVAILABLE" for x in report["results"]))
        finally:
            audit.fetch_html = original


if __name__ == "__main__":
    unittest.main()
