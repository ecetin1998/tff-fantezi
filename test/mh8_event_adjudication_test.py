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
                         "time_str": 30, "own_goal": None}
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
        self.assertIsNone(card["card_color"])
        self.assertIsNone(card["tff_fantasy_points"])
        self.assertIsNone(card["scout_player_id"])
        self.assertEqual(len(report["unmatched_event_identities"]), 1)
        self.assertNotEqual(card["internal_match_id"], card["official_tff_match_id"])

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


    def test_provider_card_assist_fields_do_not_become_official_fantasy(self):
        src, roster, curated = fixtures()
        card = src["rows"][0]["data"]["source_events"][0]
        card["source_card_type"] = "Yellow"
        goal = src["rows"][1]["data"]["source_events"][0]
        goal.update({"source_goal_assist_player_id":777,
                     "source_goal_assist_name":"Assisting teammate",
                     "source_goal_description_key":"regular"})
        roster["matches"][1]["observations"].append({
            "provider_player_id":777,"scout_player_id":991})
        # Only source candidate values are extracted, not Fantasy card/assist bonuses.
        report = stage(src,roster,curated)
        card_record = next(x for x in report["events"] if x["kind"] == "Card")
        self.assertEqual(card_record["provider_card_type"],"Yellow")
        self.assertIsNone(card_record["card_color"])
        goal_record = next(x for x in report["events"] if x["kind"] == "Goal")
        self.assertEqual(goal_record["provider_goal_assist_player_id"],777)
        self.assertEqual(goal_record["provider_goal_assist_scout_id"],991)
        self.assertEqual(goal_record["provider_goal_assist_name"],"Assisting teammate")
        self.assertIsNone(goal_record["tff_fantasy_points"])
        self.assertEqual(report["provider_card_type_observations"],1)
        self.assertEqual(report["provider_assist_id_observations"],1)
        self.assertFalse(report["card_colors_verified"])
        self.assertFalse(report["all_assists_verified"])
        self.assertFalse(report["ready_to_finalize"])

        goal.pop("source_goal_assist_player_id")
        report_missing = stage(src,roster,curated)
        actual = next(x for x in report_missing["events"] if x["kind"] == "Goal")
        self.assertIsNone(actual["provider_goal_assist_scout_id"])
        self.assertFalse(report_missing["all_assists_verified"])


if __name__ == "__main__":
    unittest.main()
