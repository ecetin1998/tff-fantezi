import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import probe_mh8_fotmob_structured as probe


class SourceProbeTests(unittest.TestCase):
    def test_detect_hydrated_match_id(self):
        html='<script>self.__next_f.push(["\"matchId\":\"5795427\""]);</script>'
        self.assertIn(5795427, probe.candidates(html))
        self.assertEqual(probe.candidates("No match ID"),[])

    def test_verify_identity_not_merely_score(self):
        fixture={"match_id":317852,"home_team":"Kasımpaşa",
                 "away_team":"Samsunspor","home_goals":4,"away_goals":1}
        data={"general":{"finished":True},
              "header":{"teams":[{"name":"Kasimpasa","score":4},{"name":"Samsunspor","score":1}]}}
        self.assertTrue(probe.matches_tff(data,fixture))
        data["header"]["teams"][0]["name"]="Istanbulspor"
        self.assertFalse(probe.matches_tff(data,fixture))
        data["header"]["teams"][0]["name"]="Kasimpasa"
        data["general"]["finished"]=False
        self.assertFalse(probe.matches_tff(data,fixture))

    def test_summary_remains_nonfinal(self):
        fixture={"match_id":317852}
        footballer=lambda i:{"id":i,"name":f"Player {i}","positionId":i}
        lineup={"source":"provider","lineupType":"confirmed",
                "homeTeam":{"name":"Home","starters":[footballer(i) for i in range(1,12)],"subs":[]},
                "awayTeam":{"name":"Away","starters":[footballer(i) for i in range(12,23)],"subs":[]}}
        detail={"content":{"lineup":lineup,"matchFacts":{"events":{"events":[{"type":"Goal"},{"type":"YellowCard"}]}},
                           "playerStats":{"homeTeam":{},"awayTeam":{}}}}
        s=probe.summarize(fixture,5795427,detail)
        self.assertTrue(s["lineup_complete"])
        self.assertEqual(s["event_type_counts"],{"Goal":1,"YellowCard":1})
        self.assertEqual(s["final_fantasy_points_written"],0)
        self.assertEqual(s["player_stat_player_count"],2)
        self.assertEqual(len(s["source_events"]),2)
        self.assertEqual(s["source_events"][0]["type"],"Goal")
        self.assertIn("keeper_source_stat_evidence",s)
        self.assertEqual(s["complete_minutes_verified"],False)
        self.assertEqual(s["all_goalkeeper_saves_verified"],False)
        self.assertFalse(s["complete_minutes_verified"])
        self.assertFalse(s["all_goalkeeper_saves_verified"])
        self.assertFalse(s["tff_bonus_verified"])


if __name__=="__main__":
    unittest.main()
