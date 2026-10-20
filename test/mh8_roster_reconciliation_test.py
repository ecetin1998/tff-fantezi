import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import reconcile_mh8_provider_players as m

ROSTER = Path(__file__).resolve().parents[1]/"data/source-evidence/gw8-scout-roster-identities-2026-10-20.json"


class ReconcileTests(unittest.TestCase):
    def test_roster_snapshot_ids_are_complete(self):
        source=json.loads(ROSTER.read_text(encoding="utf-8"))
        self.assertEqual(len(source["players"]),456)
        self.assertEqual(len(source["fixtures"]),9)
        self.assertEqual(len({p["id"] for p in source["players"]}),456)
        self.assertEqual(len({p["team_id"] for p in source["players"]}),18)

    def test_exact_team_name_is_not_loose_firstname_matching(self):
        roster=[{"id":195,"full_name":"İrfan Can Eğribayat","display_name":"İrfan Can",
                 "shirt_number":1},{"id":196,"full_name":"İrfan Can Kahveci",
                 "display_name":"İrfan Can","shirt_number":17}]
        candidate,why=m.choose_player({"player_name":"İrfan Can Eğribayat"},roster)
        self.assertEqual(candidate["id"],195)
        candidate,why=m.choose_player({"player_name":"İrfan Can"},roster)
        self.assertIsNone(candidate)
        self.assertEqual(why,"ambiguous_exact")
        candidate,why=m.choose_player({"player_name":"İrfan Can","shirt_number":1},roster)
        self.assertEqual(candidate["id"],195)
        self.assertEqual(why,"exact_team_name_jersey_tiebreak")

    def test_unique_compound_name_without_middle_parts(self):
        roster=[
            {"id":590,"full_name":"Romelu Menama Lukaku Bolingoli",
             "display_name":"Lukaku","shirt_number":None},
            {"id":591,"full_name":"Rafael Alexandre da Conceição Leão",
             "display_name":"Leao","shirt_number":27},
        ]
        matched,kind=m.choose_player({"player_name":"Romelu Lukaku","shirt_number":9},roster)
        self.assertEqual(matched["id"],590)
        self.assertEqual(kind,"unique_team_compound_name_tokens")
        matched,kind=m.choose_player({"player_name":"Rafael Leão","shirt_number":27},roster)
        self.assertEqual(matched["id"],591)
        self.assertEqual(kind,"unique_team_compound_name_tokens")
        matched,kind=m.choose_player({"player_name":"Lukaku","shirt_number":9},roster)
        self.assertIsNone(matched,"one ambiguous single name must NOT auto-resolve")
        roster.append({"id":592,"full_name":"Romelu A Lukaku","shirt_number":None})
        matched,kind=m.choose_player({"player_name":"Romelu Lukaku","shirt_number":9},roster)
        self.assertIsNone(matched,"duplicate names must fail closed")

    def test_missing_not_zero_and_no_automatic_fantasy_final(self):
        roster={"gameweek":8,"players":[
            {"id":100,"full_name":"Örnek Oyuncu","display_name":"Örnek Oyuncu",
             "shirt_number":7,"team_id":12}],
            "fixtures":[{"match_id":317847,"home_team_id":12,"away_team_id":99}]+[
                {"match_id":mid,"home_team_id":90,"away_team_id":91}
                for mid in range(317848,317856)
            ]}
        observed={"gameweek":8,"rows":[
            {"fixture_id":317847,"status":"STRUCTURED_FIXTURE_CONFIRMED",
             "data":{"observed_player_stat_components":[
                {"side":"home","provider_id":765,"player_name":"Örnek Oyuncu","shirt_number":7,
                 "explicit_source_metrics":{"minutes_played":90,"goals":1}},
                {"side":"away","provider_id":876,"player_name":"Bilinmeyen","shirt_number":3,
                 "explicit_source_metrics":{"saves":0}},
            ]}},
        ]+[{"fixture_id":mid,"status":"NOT_VERIFIED"} for mid in range(317848,317856)]}
        result=m.reconcile(observed,roster)
        self.assertEqual(result["sourced_played"],1)
        self.assertEqual(result["matched_played"],1)
        self.assertEqual(result["unmatched_played"],0)
        self.assertFalse(result["safe_to_close_mh8"])
        row=result["matches"][0]["observations"][0]
        self.assertEqual(row["scout_player_id"],100)
        self.assertFalse(row["is_final_tff_fantasy"])
        unknown=result["matches"][0]["observations"][1]
        self.assertNotIn("minutes_played",unknown["source_metrics"])
        self.assertFalse(unknown["played_from_explicit_minutes"])


    def test_only_eight_exact_tff_fixture_proven_reviewed_aliases(self):
        root=Path(__file__).resolve().parents[1]/"data/source-evidence"
        roster=json.loads(ROSTER.read_text(encoding="utf-8"))
        official=json.loads((root/"gw8-scout-to-official-tff-match-identities-2026-10-20.json").read_text(encoding="utf-8"))
        reviewed=json.loads((root/"gw8-reviewed-player-identities-tff-2026-10-20.json").read_text(encoding="utf-8"))
        self.assertEqual(len(reviewed["entries"]),8)
        by_fixture={f["match_id"]: f for f in roster["fixtures"]}
        rows={f["match_id"]: {"fixture_id":f["match_id"],
              "status":"STRUCTURED_FIXTURE_CONFIRMED",
              "data":{"observed_player_stat_components":[]}} for f in roster["fixtures"]}
        for proof in reviewed["entries"]:
            fixture=by_fixture[proof["internal_match_id"]]
            side=("home" if fixture["home_team_id"]==proof["team_id"]
                  else "away" if fixture["away_team_id"]==proof["team_id"] else None)
            self.assertIsNotNone(side, "reviewed source must belong to official fixture team")
            rows[fixture["match_id"]]["data"]["observed_player_stat_components"].append({
                "side":side,"provider_id":proof["provider_player_id"],
                "player_name":proof["provider_name"],"shirt_number":proof["provider_shirt_number"],
                "explicit_source_metrics":{},
            })
        report={"gameweek":8,"rows":[rows[k] for k in sorted(rows)]}
        result=m.reconcile(report,roster,reviewed,official)
        matched={o["provider_player_id"]:o for fixture in result["matches"]
                 for o in fixture["observations"]}
        self.assertEqual(len(matched),8)
        for proof in reviewed["entries"]:
            o=matched[proof["provider_player_id"]]
            self.assertEqual(o["scout_player_id"],proof["scout_player_id"])
            self.assertEqual(o["mapping_method"],"reviewed_official_tff_lineup")
            self.assertFalse(o["is_final_tff_fantasy"])
        self.assertEqual(result["official_fantasy_points_written"],0)
        self.assertFalse(result["safe_to_close_mh8"])

        # Even an established ID must not override a different player/jersey.
        import copy
        bad=copy.deepcopy(report)
        target=next(row for row in bad["rows"] if row["fixture_id"]==317849)
        target["data"]["observed_player_stat_components"][0]["shirt_number"]="14"
        with self.assertRaises(ValueError):
            m.reconcile(bad,roster,reviewed,official)

        bad_official=copy.deepcopy(official)
        bad_official["matches"][0]["tff_match_id"]=123456
        # Crosswalk drift for a reviewed fixture must be rejected, not silently ignored.
        bad_official["matches"][2]["tff_match_id"]=999999
        with self.assertRaises(ValueError):
            m.reconcile(report,roster,reviewed,bad_official)


if __name__=="__main__":
    unittest.main()
