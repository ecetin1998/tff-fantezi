import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from extract_gw8_11_team_source import pairs,extract
class TeamSourceTest(unittest.TestCase):
 def fixture(self):
  return {"content":{"stats":{"Periods":{"All":{"stats":[
    {"key":"top_stats","stats":[{"key":"expected_goals","rawStats":[{"value":1.15},{"value":2.46}]},
      {"key":"total_shots","rawStats":[{"value":16},{"value":11}]},
      {"key":"ShotsOnTarget","rawStats":[{"value":4},{"value":5}]}]}]}}}}}
 def test_two_teams_expected_goals_and_shots(self):
  facts=pairs(self.fixture())
  self.assertEqual(facts["xg"],(1.15,2.46))
  self.assertEqual(facts["shots"],(16,11))
 def test_missing_is_not_zero(self):
  inp=self.fixture()
  inp["content"]["stats"]["Periods"]["All"]["stats"][0]["stats"].pop()
  self.assertNotIn("shots_on_target",pairs(inp))
 def test_sot_cannot_exceed_shots(self):
  inp=self.fixture()
  inp["content"]["stats"]["Periods"]["All"]["stats"][0]["stats"][-1]["rawStats"][0]["value"]=30
  with self.assertRaises(ValueError):pairs(inp)
 def test_manifest_must_cover_36(self):
  with self.assertRaises(ValueError):extract({"season":"2026-27","matches":[]})
if __name__=="__main__":unittest.main()
