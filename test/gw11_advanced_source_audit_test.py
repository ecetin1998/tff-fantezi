import sys, unittest
from datetime import timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from audit_gw11_advanced_sources import verified_fixture,as_utc,audit
class SourceAuditTest(unittest.TestCase):
 def setUp(self):
  self.fixture={"match_id":317875,"home_team":"Eyüpspor","away_team":"Kocaelispor",
    "home_goals":0,"away_goals":2,"kickoff_at":"2026-11-07 10:30:00+00"}
  self.good={"general":{"finished":True,"matchTimeUTCDate":"2026-11-07T10:30:00.000Z"},
    "header":{"teams":[{"name":"Eyüpspor","score":"0"},{"name":"Kocaelispor","score":"2"}]}}
 def test_kickoff_matching(self):
  self.assertTrue(verified_fixture(self.good,self.fixture))
 def test_same_slug_previous_season_is_not_evidence(self):
  altered={**self.good,"general":{**self.good["general"],"matchTimeUTCDate":"2026-03-09T13:00:00Z"}}
  self.assertFalse(verified_fixture(altered,self.fixture))
 def test_missing_date_score_source_is_not_evidence(self):
  altered={**self.good,"general":{"finished":True}}
  self.assertFalse(verified_fixture(altered,self.fixture))
  self.assertIsNone(as_utc("not-a-date"))
 def test_partial_fixture_manifest_fails_closed(self):
  with self.assertRaises(ValueError):
   audit({"season":"2026-27","gameweek":11,"matches":[self.fixture]})
if __name__=="__main__":unittest.main()
