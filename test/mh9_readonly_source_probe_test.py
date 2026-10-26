"""Read-only MH9 provider intake guards: incomplete sources never become zero points."""
import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("mh9_source_probe", ROOT / "scripts" / "probe_mh9_fotmob_sources.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MANIFEST = json.loads((ROOT / "data/source-evidence/gw9-fotmob-match-page-candidates-2026-10-27.json").read_text(encoding="utf-8"))


class MH9ReadOnlySourceTest(unittest.TestCase):
    def test_nine_verified_fixture_keys_and_eighteen_unique_clubs(self):
        self.assertEqual(len(module.validate_manifest(MANIFEST)), 9)

    def test_no_fake_verified_player_stats_or_scores(self):
        modified = copy.deepcopy(MANIFEST)
        modified["matches"][0]["verified_fantasy_points"] = True
        with self.assertRaisesRegex(ValueError, "preclaim"):
            module.validate_manifest(modified)

    def test_reject_duplicate_match_or_duplicate_club(self):
        modified = copy.deepcopy(MANIFEST)
        modified["matches"][0]["match_id"] = modified["matches"][1]["match_id"]
        with self.assertRaises(ValueError):
            module.validate_manifest(modified)
        modified = copy.deepcopy(MANIFEST)
        modified["matches"][0]["away_team"] = modified["matches"][1]["away_team"]
        with self.assertRaisesRegex(ValueError, "18 clubs"):
            module.validate_manifest(modified)

    def test_unavailable_page_preserves_unknown_and_no_writes(self):
        with patch.object(module, "fetch_html", side_effect=OSError("provider unavailable")):
            report = module.probe(MANIFEST, pause_seconds=0)
        self.assertEqual(len(report["rows"]), 9)
        self.assertEqual(report["structured_fixtures"], 0)
        self.assertEqual(report["official_fantasy_points_written"], 0)
        self.assertFalse(report["safe_to_close_gameweek"])
        self.assertFalse(report["missing_stats_mean_zero"])
        self.assertTrue(all(r["fantasy_points"] is None for r in report["rows"]))


if __name__ == "__main__":
    unittest.main()
