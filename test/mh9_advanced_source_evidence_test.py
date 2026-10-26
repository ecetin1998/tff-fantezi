import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from extract_mh9_fotmob_advanced import extract, validate_inputs

manifest = json.loads((ROOT / "data/source-evidence/gw9-fotmob-match-page-candidates-2026-10-27.json").read_text(encoding="utf-8"))
source = {
    "gameweek": 9, "structured_fixtures": 9,
    "rows": [
        {"fixture_id": m["match_id"], "status": "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL",
         "source_details": {"fixture_id": m["match_id"], "fotmob_match_id": 6000000 + i,
                            "fixture_verified_against_tff": True, "lineup_complete": True,
                            "observed_player_stat_components": [
                                {"provider_id": 7000000 + i, "player_name": "Test Player"}
                            ]}}
        for i, m in enumerate(manifest["matches"])
    ],
}
fixture_id = manifest["matches"][0]["match_id"]
identity = {
    "gameweek": 9, "roster_size": 456, "fixtures": 9, "source_matched_fixtures": 9,
    "db_writes": 0, "official_fantasy_points_written": 0, "matched_played": 1,
    "unmatched_played": 0, "unmatched_players": [],
    "source_players": [{
        "match_id": fixture_id, "provider_player_id": 7000000, "scout_player_id": 5001,
        "source_name": "Test Player", "team_id": 1, "observed_minutes": 90,
        "identity_method": "exact_team_name", "played_explicit_minutes": True
    }]
}


class MH9AdvancedEvidenceTest(unittest.TestCase):
    def test_requires_nine_fulltime_verified_fixtures(self):
        self.assertEqual(len(validate_inputs(manifest, source, identity)), 9)
        bad = copy.deepcopy(source)
        bad["rows"][0]["source_details"]["lineup_complete"] = False
        with self.assertRaises(ValueError):
            validate_inputs(manifest, bad, identity)

    def test_no_invented_zero_and_no_fantasy_writes(self):
        def loader(provider_id):
            return {"content": {"playerStats": {"7000000": {"stats": []}}}}
        with patch("extract_mh9_fotmob_advanced.matches_tff", return_value=True):
            observed = extract(manifest, source, identity, pause_seconds=0, loader=loader)
        self.assertEqual(observed["matched_played"], 1)
        self.assertTrue(all(observed["rows"][0][k] is None for k in observed["coverage"]))
        self.assertEqual(observed["official_fantasy_points_written"], 0)
        self.assertEqual(observed["database_writes"], 0)
        self.assertFalse(observed["safe_to_promote_mh10"])

    def test_missing_provider_stats_fails_closed(self):
        with patch("extract_mh9_fotmob_advanced.matches_tff", return_value=True):
            with self.assertRaisesRegex(ValueError, "no provider stats"):
                extract(manifest, source, identity, pause_seconds=0,
                        loader=lambda provider_id: {"content": {"playerStats": {}}})

    def test_wrong_score_blocks_source_extraction(self):
        with patch("extract_mh9_fotmob_advanced.matches_tff", return_value=False):
            with self.assertRaisesRegex(ValueError, "fixture changed"):
                extract(manifest, source, identity, pause_seconds=0,
                        loader=lambda provider_id: {"content": {"playerStats": {}}})


if __name__ == "__main__":
    unittest.main()
