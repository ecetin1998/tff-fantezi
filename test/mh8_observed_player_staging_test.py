import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from stage_mh8_observed_player_metrics import build

ROOT=Path(__file__).resolve().parents[1]
ROSTER=json.loads((ROOT/"data/source-evidence/gw8-scout-roster-identities-2026-10-20.json").read_text(encoding="utf-8"))
OFFICIAL=json.loads((ROOT/"data/source-evidence/gw8-scout-to-official-tff-match-identities-2026-10-20.json").read_text(encoding="utf-8"))


def synthetic():
    fixtures=[]
    for i,m in enumerate(OFFICIAL["matches"]):
        fixture={
            "match_id":m["internal_match_id"],"status":"STAGED_NON_FINAL",
            "observations":[],"played_observed":0,"matched_played":0,"unmatched_played":0,
        }
        if i==0:
            player=next(p for p in ROSTER["players"] if p["team_id"]==8)
            fixture["observations"].append({
                "match_id":m["internal_match_id"],"team_id":player["team_id"],
                "provider_player_id":795,"provider_player_name":"Source "+player["full_name"],
                "provider_shirt_number":player.get("shirt_number"),
                "scout_player_id":player["id"],"mapping_method":"exact_team_name",
                "played_from_explicit_minutes":True,
                "source_metrics":{"minutes_played":90,"saves":3},
                "is_final_tff_fantasy":False,
            })
        fixtures.append(fixture)
    return {"gameweek":8,"source_fixtures":9,"matches":fixtures,
            "matched_played":1,"unmatched_played":0}


class SourceStagingTests(unittest.TestCase):
    def test_nonfinal_source_record_with_match_provenance(self):
        x=build(synthetic(),ROSTER,OFFICIAL)
        self.assertEqual(x["verified_fixtures"],9)
        self.assertEqual(x["matched_played"],1)
        self.assertEqual(x["unmatched_played"],0)
        self.assertEqual(x["metric_coverage"],{"minutes_played":1,"saves":1})
        self.assertFalse(x["ready_to_close"])
        self.assertEqual(x["official_player_fantasy_points_written"],0)
        p=x["matched_observations"][0]
        self.assertEqual(p["internal_match_id"],317847)
        self.assertEqual(p["official_tff_match_id"],317852)
        self.assertEqual(p["observed_metrics"],{"minutes_played":90,"saves":3})
        self.assertIsNone(p["computed_fantasy_points"])
        self.assertFalse(p["is_final_tff_fantasy"])

    def test_empty_source_minutes_are_not_zeros(self):
        data=synthetic()
        data["matches"][0]["observations"][0]["source_metrics"].pop("minutes_played")
        with self.assertRaises(ValueError):
            build(data,ROSTER,OFFICIAL)

    def test_cross_team_and_duplicate_player_are_not_silent(self):
        data=synthetic()
        data["matches"][0]["observations"][0]["team_id"]=123456
        with self.assertRaises(ValueError):
            build(data,ROSTER,OFFICIAL)
        data=synthetic()
        data["matches"][0]["observations"].append(
            deepcopy(data["matches"][0]["observations"][0]))
        data["matched_played"]=2
        with self.assertRaises(ValueError):
            build(data,ROSTER,OFFICIAL)

    def test_never_accepts_fantasy_final_from_provider(self):
        data=synthetic()
        data["matches"][0]["observations"][0]["is_final_tff_fantasy"]=True
        with self.assertRaises(ValueError):
            build(data,ROSTER,OFFICIAL)

    def test_unresolved_player_is_separated_for_review(self):
        data=synthetic()
        unmatched=deepcopy(data["matches"][0]["observations"][0])
        unmatched.update({"provider_player_id":999, "scout_player_id":None,
                          "mapping_method":"unresolved_identity"})
        data["matches"][0]["observations"].append(unmatched)
        data["unmatched_played"]=1
        x=build(data,ROSTER,OFFICIAL)
        self.assertEqual(x["matched_played"],1)
        self.assertEqual(x["unmatched_played"],1)
        self.assertEqual(len(x["identity_review_queue"]),1)
        self.assertFalse(x["ready_to_close"])


if __name__=="__main__":
    unittest.main()
