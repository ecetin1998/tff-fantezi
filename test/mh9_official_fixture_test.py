import json
import unittest
from datetime import datetime,timedelta
from pathlib import Path

MANIFEST=Path(__file__).resolve().parents[1]/"data/source-evidence/gw9-official-tff-fixtures-2026-10-20.json"


class Week9FixtureProvenanceTests(unittest.TestCase):
    def test_all_nine_tff_matches_are_correctly_identified(self):
        source=json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(source["gameweek"],9)
        self.assertEqual(source["season"],"2026-27")
        self.assertEqual(source["verified_on"],"2026-10-20")
        fixtures=source["fixtures"]
        self.assertEqual(len(fixtures),9)
        internal=[f["internal_match_id"] for f in fixtures]
        official=[f["tff_match_id"] for f in fixtures]
        self.assertEqual(set(internal),set(range(317856,317865)))
        self.assertEqual(set(official),set(range(317856,317865)))
        self.assertEqual(len(set(internal)),9)
        self.assertEqual(len(set(official)),9)
        self.assertTrue(all(f["internal_match_id"]==f["tff_match_id"] for f in fixtures))
        for f in fixtures:
            self.assertEqual(f["official_url"],
                             f"https://www.tff.org/Default.aspx?macID={f['tff_match_id']}&pageID=29")
            self.assertTrue(f["home_team"] and f["away_team"])

    def test_team_once_and_deadline_one_hour_before_earliest_kickoff(self):
        source=json.loads(MANIFEST.read_text(encoding="utf-8"))
        fixtures=source["fixtures"]
        teams=[x[p] for x in fixtures for p in ("home_team","away_team")]
        self.assertEqual(len(teams),18)
        self.assertEqual(len(set(teams)),18)
        kickoffs=[datetime.fromisoformat(f["kickoff_at_local"]) for f in fixtures]
        self.assertEqual(kickoffs,sorted(kickoffs))
        self.assertTrue(all(k.utcoffset()==timedelta(hours=3) for k in kickoffs))
        self.assertEqual(datetime.fromisoformat(source["deadline_at"]),
                         min(kickoffs)-timedelta(hours=1))
        self.assertEqual(source["deadline_at"],"2026-10-23T19:00:00+03:00")

    def test_derby_and_week9_terminal_match(self):
        source=json.loads(MANIFEST.read_text(encoding="utf-8"))
        final=source["fixtures"][-1]
        self.assertEqual((final["home_team"],final["away_team"]),
                         ("Galatasaray","Fenerbahçe"))
        self.assertEqual(final["tff_match_id"],317862)
        self.assertEqual(final["kickoff_at_local"],"2026-10-26T21:30:00+03:00")


if __name__=="__main__":
    unittest.main()
