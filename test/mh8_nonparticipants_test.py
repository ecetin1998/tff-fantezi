import sys
import unittest
from copy import deepcopy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from audit_mh8_nonparticipants import build


def fixture_data():
    fixtures=[]
    matches=[]
    for i in range(9):
        mid=317847+i
        home=2*i+1
        away=2*i+2
        fixtures.append({"match_id":mid,"home_team_id":home,"away_team_id":away})
        observations=[]
        if i==0:
            observations=[
                {"match_id":mid,"team_id":home,"scout_player_id":10,
                 "provider_player_id":1000,"provider_player_name":"Player A",
                 "played_from_explicit_minutes":True,"source_metrics":{"minutes_played":90}},
                {"match_id":mid,"team_id":home,"scout_player_id":11,
                 "provider_player_id":1001,"provider_player_name":"Player B",
                 "played_from_explicit_minutes":False,"source_metrics":{}},
                {"match_id":mid,"team_id":home,"scout_player_id":None,
                 "provider_player_id":9999,"provider_player_name":"Unknown bench",
                 "played_from_explicit_minutes":False,"source_metrics":{}},
            ]
        matches.append({"match_id":mid,"status":"STAGED_NON_FINAL","observations":observations})
    identities={"gameweek":8,"source_fixtures":9,"safe_to_close_mh8":False,
                "official_fantasy_points_written":0,"matched_played":1,"unmatched_played":0,
                "matches":matches}
    roster={"gameweek":8,"fixtures":fixtures,"players":[
        {"id":10,"team_id":1,"full_name":"Player A"},
        {"id":11,"team_id":1,"full_name":"Player B"},
        {"id":12,"team_id":1,"full_name":"Player C"}]}
    return identities,roster


class NonParticipantCoverageTests(unittest.TestCase):
    def test_unknown_minutes_do_not_become_zeros(self):
        ids,roster=fixture_data()
        result=build(ids,roster)
        self.assertEqual(result["participation_counts"],{
            "SOURCE_PLAYED_MINUTES":1,"LINEUP_LISTED_NO_MINUTES":1,
            "NOT_LINKED_TO_SOURCE_LINEUP":1})
        self.assertEqual(result["confirmed_zero_minute_players"],0)
        self.assertEqual(len(result["unresolved_source_bench_identities"]),1)
        self.assertFalse(result["ready_to_close"])
        rows={r["scout_player_id"]:r for r in result["rows"]}
        self.assertEqual(rows[10]["observed_minutes"],90)
        self.assertIsNone(rows[11]["observed_minutes"])
        self.assertIsNone(rows[12]["observed_minutes"])
        self.assertFalse(rows[11]["verified_zero_minutes"])
        self.assertFalse(rows[12]["verified_zero_minutes"])
        self.assertTrue(all(r["official_fantasy_points"] is None for r in result["rows"]))

    def test_played_player_requires_explicit_positive_minutes(self):
        ids,roster=fixture_data()
        ids["matches"][0]["observations"][0]["source_metrics"].clear()
        with self.assertRaises(ValueError):
            build(ids,roster)

    def test_unknown_bench_fails_closed_if_played(self):
        ids,roster=fixture_data()
        ids["matches"][0]["observations"][2].update({
            "played_from_explicit_minutes":True,"source_metrics":{"minutes_played":12}})
        with self.assertRaises(ValueError):
            build(ids,roster)

    def test_wrong_fixture_or_duplicate_identity_fails(self):
        ids,roster=fixture_data()
        ids["matches"][0]["observations"][1]["team_id"]=3
        with self.assertRaises(ValueError):
            build(ids,roster)
        ids,roster=fixture_data()
        ids["matches"][0]["observations"][1]["scout_player_id"]=10
        with self.assertRaises(ValueError):
            build(ids,roster)

    def test_cannot_claim_finality(self):
        ids,roster=fixture_data()
        ids["safe_to_close_mh8"]=True
        with self.assertRaises(ValueError):
            build(ids,roster)
        ids,roster=fixture_data()
        ids["official_fantasy_points_written"]=1
        with self.assertRaises(ValueError):
            build(ids,roster)


if __name__=="__main__":
    unittest.main()
