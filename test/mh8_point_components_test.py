import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from stage_mh8_point_components import stage


def example():
    a={"gameweek":8,"verified_fixtures":9,"ready_to_close":False,
       "official_player_fantasy_points_written":0,"matched_played":2,"unmatched_played":0,
       "matched_observations":[
           {"internal_match_id":100,"official_tff_match_id":300,"scout_player_id":1,
            "provider_player_id":501,"team_id":10,"scout_full_name":"Keeper",
            "observed_metrics":{"minutes_played":90,"saves":4},"computed_fantasy_points":None,
            "is_final_tff_fantasy":False},
           {"internal_match_id":100,"official_tff_match_id":300,"scout_player_id":2,
            "provider_player_id":502,"team_id":10,"scout_full_name":"Midfielder",
            "observed_metrics":{"minutes_played":60,"goals":1,"assists":0},
            "computed_fantasy_points":None,"is_final_tff_fantasy":False}]}
    b={"gameweek":8,"fixtures_verified":9,"ready_to_finalize":False,"tff_fantasy_points_written":0,
       "events":[{"internal_match_id":100,"scout_player_id":2,"kind":"Card","card_color":"Yellow",
                  "is_final_tff_fantasy":False},
                 {"internal_match_id":100,"scout_player_id":None,"scout_assist_player_id":2,
                  "kind":"Goal","is_final_tff_fantasy":False}],
       "separate_official_fantasy_attributions":[]}
    c={"gameweek":8,"players":[{"id":1,"team_id":10,"position":"GK"},
                                {"id":2,"team_id":10,"position":"MID"}]}
    return a,b,c


class ScoringStagingTests(unittest.TestCase):
    def test_source_only_never_total_or_bonus(self):
        a,b,c=example()
        result=stage(a,b,c)
        self.assertEqual(result["source_played_count"],2)
        self.assertFalse(result["ready_to_close"])
        self.assertEqual(result["official_points_written"],0)
        k,m=result["rows"]
        self.assertEqual(k["source_component_candidates"]["keeper_saves_provider"],1)
        self.assertIsNone(k["source_component_candidates"]["goals_provider"])
        self.assertEqual(m["source_component_candidates"]["appearance"],1)
        self.assertEqual(m["source_component_candidates"]["goals_provider"],5)
        self.assertEqual(m["source_component_candidates"]["assists_provider"],0)
        self.assertEqual(m["source_component_candidates"]["card_deductions_observed"],-1)
        self.assertEqual(m["linked_source_assist_event_count"],1)
        self.assertIsNone(m["computed_total_fantasy_points"])
        self.assertIsNone(m["official_bonus_points"])

    def test_missing_is_unknown_not_zero(self):
        a,b,c=example()
        del a["matched_observations"][0]["observed_metrics"]["saves"]
        del a["matched_observations"][1]["observed_metrics"]["assists"]
        result=stage(a,b,c)
        self.assertIsNone(result["rows"][0]["source_component_candidates"]["keeper_saves_provider"])
        self.assertIsNone(result["rows"][1]["source_component_candidates"]["assists_provider"])
        self.assertIsNone(result["rows"][0]["source_component_candidates"]["card_deductions_observed"])

    def test_incomplete_or_untrusted_fails_closed(self):
        a,b,c=example()
        a["unmatched_played"]=1
        with self.assertRaises(ValueError):stage(a,b,c)
        a,b,c=example()
        b["events"][0]["card_color"]="Unknown"
        with self.assertRaises(ValueError):stage(a,b,c)
        a,b,c=example()
        a["matched_observations"][1]["is_final_tff_fantasy"]=True
        with self.assertRaises(ValueError):stage(a,b,c)

    def test_explicit_tff_own_goal_override_stays_nonfinal(self):
        a,b,c=example()
        b["separate_official_fantasy_attributions"]=[{
            "internal_match_id":100,"scout_player_id":1,
            "source":"TFF Fantezi Lig official app (user-reported observation)",
            "attribution":"IRFAN_CAN_EGRIBAYAT_OWN_GOAL"}]
        row=stage(a,b,c)["rows"][0]
        self.assertEqual(row["source_component_candidates"]["own_goal_deductions_observed"],-2)
        self.assertTrue(row["tff_app_own_goal_override_present"])
        self.assertFalse(row["is_final_tff_fantasy"])
