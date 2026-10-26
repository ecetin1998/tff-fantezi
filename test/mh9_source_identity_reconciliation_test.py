"""MH9 source/Scout crosswalk checks, no Fantasy actuals inferred."""
import importlib.util
import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("mh9_identity", ROOT / "scripts/reconcile_mh9_provider_players.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ROSTER = json.loads((ROOT / "data/source-evidence/gw9-scout-roster-identities-2026-10-27.json").read_text(encoding="utf-8"))
FIDS = [f["match_id"] for f in ROSTER["fixtures"]]


def empty_report():
    return {"gameweek": 9, "rows": [
        {"fixture_id": mid, "status": "SOURCE_UNAVAILABLE"} for mid in FIDS
    ]}


class MH9PlayerIdentityTest(unittest.TestCase):
    def test_complete_live_roster_and_nine_fixtures(self):
        self.assertEqual(len(ROSTER["players"]), 456)
        self.assertEqual(set(FIDS), set(range(317856, 317865)))

    def test_empty_source_never_infers_nonparticipation_or_points(self):
        result = module.reconcile(empty_report(), ROSTER)
        self.assertEqual(result["matched_played"], 0)
        self.assertEqual(result["unseen_registered_players"], sorted(x["id"] for x in ROSTER["players"]))
        self.assertFalse(result["missing_player_values_are_zero"])
        self.assertFalse(result["safe_to_close_gameweek"])

    def test_exact_team_and_name_match_with_explicit_minutes(self):
        r = empty_report()
        fx = ROSTER["fixtures"][0]
        p = next(x for x in ROSTER["players"] if x["team_id"] == fx["home_team_id"] and len(x["full_name"].split()) > 1)
        r["rows"][0] = {
            "fixture_id": fx["match_id"], "status": "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL",
            "source_details": {
                "fixture_id": fx["match_id"], "fixture_verified_against_tff": True, "lineup_complete": True,
                "observed_player_stat_components": [{
                    "provider_id": 12345, "player_name": p["full_name"], "shirt_number": p["shirt_number"],
                    "side": "home", "explicit_source_metrics": {"minutes_played": 90}
                }],
                "source_events": (
                    [{"type": "Goal", "is_home": True, "provider_player_id": None}] * fx["home_goals"] +
                    [{"type": "Goal", "is_home": False, "provider_player_id": None}] * fx["away_goals"]
                ),
            },
        }
        result = module.reconcile(r, ROSTER)
        self.assertEqual(result["matched_played"], 1)
        self.assertEqual(result["source_players"][0]["scout_player_id"], p["id"])
        self.assertIsNone(result["source_players"][0]["tff_fantasy_points"])
        self.assertFalse(result["source_players"][0]["fantasy_final"])

    def test_provider_score_mismatch_rejected(self):
        r = empty_report()
        fx = ROSTER["fixtures"][0]
        r["rows"][0] = {"fixture_id": fx["match_id"], "status": "STRUCTURED_FIXTURE_CONFIRMED_NON_FINAL",
            "source_details": {"fixture_id": fx["match_id"], "fixture_verified_against_tff": True,
                "lineup_complete": True, "observed_player_stat_components": [], "source_events": []}}
        with self.assertRaisesRegex(ValueError, "event score"):
            module.reconcile(r, ROSTER)


if __name__ == "__main__":
    unittest.main()
