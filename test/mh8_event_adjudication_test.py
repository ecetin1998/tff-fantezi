import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from stage_mh8_event_adjudication import stage

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/source-evidence/gw8-goal-penalty-event-staging-2026-10-20.json"


def fixtures():
    src = {"gameweek": 8, "safe_to_close_gameweek": False, "rows": []}
    roster = {"gameweek": 8, "safe_to_close_mh8": False, "matches": []}
    curated = {"gameweek": 8, "matches": []}
    for idx in range(9):
        mid = 317847 + idx
        raw_event = {"type": "Goal", "provider_event_id": idx + 10,
                     "provider_player_id": 700 + idx, "provider_player_name": "Observed",
                     "time_str": "45 + 1", "own_goal": None}
        if idx == 0:
            raw_event = {"type": "Card", "provider_event_id": 10,
                         "provider_player_id": 700, "provider_player_name": "Observed",
                         "time_str": 30, "own_goal": None,
                         "source_card_color": "Yellow"}
        src["rows"].append({
            "fixture_id": mid, "status": "STRUCTURED_FIXTURE_CONFIRMED",
            "data": {"source_events": [raw_event]}})
        roster["matches"].append({
            "match_id": mid, "observations": [{
                "provider_player_id": 700 + idx,
                "scout_player_id": None if idx == 0 else 900 + idx}]})
        goals = [] if idx == 0 else [{"scorer_id": 900 + idx}]
        curated["matches"].append({
            "match_id": mid, "official_tff_match_id": 400000 + idx,
            "goals": goals})
    return src, roster, curated


class StageEventsTests(unittest.TestCase):
    def test_no_points_inferred_and_missing_card_color_not_yellow(self):
        report = stage(*fixtures())
        self.assertEqual(report["event_counts"], {"Card": 1, "Goal": 8, "MissedPenalty": 0})
        self.assertEqual(report["tff_fantasy_points_written"], 0)
        self.assertFalse(report["ready_to_finalize"])
        card = report["events"][0]
        self.assertEqual(card["card_color"], "Yellow")
        self.assertEqual(report["observed_card_color_count"], 1)
        self.assertIsNone(card["tff_fantasy_points"])
        self.assertIsNone(card["scout_player_id"])
        self.assertEqual(len(report["unmatched_event_identities"]), 1)
        self.assertNotEqual(card["internal_match_id"], card["official_tff_match_id"])

    def test_source_assist_player_id_is_used_only_with_same_fixture_identity(self):
        src, roster, curated = fixtures()
        src["rows"][1]["data"]["source_events"][0]["source_assist_provider_id"] = 99999
        report = stage(src, roster, curated)
        goal = next(e for e in report["events"] if e["internal_match_id"] == 317848)
        self.assertEqual(goal["source_assist_provider_id"], 99999)
        self.assertIsNone(goal["scout_assist_player_id"])
        self.assertEqual(report["source_assist_id_count"], 1)
        roster["matches"][1]["observations"].append({
            "provider_player_id": 99999, "scout_player_id": 4001})
        report = stage(src, roster, curated)
        goal = next(e for e in report["events"] if e["internal_match_id"] == 317848)
        self.assertEqual(goal["scout_assist_player_id"], 4001)
        self.assertEqual(report["source_assist_linked_count"], 1)
        self.assertIsNone(goal["tff_fantasy_points"])
        self.assertFalse(report["ready_to_finalize"])

    def test_source_goal_mismatch_rejected(self):
        src, roster, curated = fixtures()
        curated["matches"][1]["goals"].clear()
        with self.assertRaisesRegex(ValueError, "curated goal count"):
            stage(src, roster, curated)

    def test_nonfinal_safety_gate(self):
        src, roster, curated = fixtures()
        src["safe_to_close_gameweek"] = True
        with self.assertRaisesRegex(ValueError, "NONFINAL"):
            stage(src, roster, curated)

    def test_curated_real_manifest_keeps_tff_own_goal_and_penalty_evidence(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(sum(len(m["goals"]) for m in manifest["matches"]), 23)
        overrides = [g for m in manifest["matches"] for g in m["goals"]
                     if g.get("fantasy_attribution")]
        self.assertEqual(len(overrides), 1)
        self.assertEqual(overrides[0]["fantasy_attribution"], "IRFAN_CAN_EGRIBAYAT_OWN_GOAL")
        saved = [e for m in manifest["matches"] for e in m.get("special_events", [])
                 if e["type"] == "saved_penalty"]
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["taker"], "Mason Greenwood")
        self.assertEqual(saved[0]["keeper"], "Paulo Victor")


if __name__ == "__main__":
    unittest.main()
