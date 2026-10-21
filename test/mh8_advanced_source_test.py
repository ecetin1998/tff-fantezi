import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from extract_mh8_fotmob_advanced import explicit_attack_metrics, build_advanced


def advanced(**by_key):
    return {"stats": [{"stats": {
        k: {"key": k, "stat": {"value": v, "type": "double" if isinstance(v, float) else "integer"}}
        for k, v in by_key.items()
    }}]}


class MH8AdvancedSourceTests(unittest.TestCase):
    def test_accepts_only_explicit_provider_keyed_advanced_stats(self):
        player = advanced(expected_goals=0.15, expected_assists=0.02,
                          total_shots=3, ShotsOnTarget=1, chances_created=2,
                          rating_title=7.9, fantasy_points=11)
        self.assertEqual(explicit_attack_metrics(player),
                         {"xg":0.15,"xa":0.02,"shots":3,"shots_on_target":1,"key_passes":2})
        self.assertEqual(explicit_attack_metrics({"stats":[]}), {})
        self.assertEqual(explicit_attack_metrics(advanced(expected_goals=None)), {})
        self.assertEqual(explicit_attack_metrics(advanced(total_shots="3")), {})
        self.assertEqual(explicit_attack_metrics(advanced(fantasy_points=11)), {})

    def test_zero_is_only_allowed_when_explicitly_reported(self):
        self.assertEqual(explicit_attack_metrics(advanced(total_shots=0, expected_goals=0.0)),
                         {"shots":0,"xg":0.0})
        self.assertNotIn("xa", explicit_attack_metrics(advanced(expected_goals=0.0)))

    def test_invalid_and_inconsistent_advanced_stats_rejected(self):
        for metrics in (
            advanced(total_shots=-1), advanced(expected_goals=-0.5),
            advanced(total_shots=2.6), advanced(total_shots=2, ShotsOnTarget=3),
            advanced(expected_goals=9.0), advanced(expected_assists=float("nan")),
        ):
            with self.subTest(metrics=metrics):
                if "nan" in str(metrics):
                    self.assertEqual(explicit_attack_metrics(metrics), {})
                else:
                    with self.assertRaises(ValueError):
                        explicit_attack_metrics(metrics)

    def test_reconciled_source_is_read_only_and_not_a_fantasy_score(self):
        matches = []
        raw = {}
        pid = 1
        for match_id in range(317847,317856):
            observations = []
            raw_player_stats = {}
            limit = 31 if match_id in (317849,317855) else 32
            for _ in range(limit):
                observations.append({
                    "played_from_explicit_minutes":True,
                    "scout_player_id":pid,"provider_player_id":100000+pid,
                    "provider_player_name":"Observed Player "+str(pid),
                    "team_id":10,"mapping_method":"reviewed_official_tff_lineup",
                })
                raw_player_stats[str(100000+pid)] = advanced(
                    expected_goals=0.1, expected_assists=0.03, total_shots=1,
                    ShotsOnTarget=0, chances_created=1)
                pid += 1
            matches.append({"match_id":match_id,"status":"STAGED_NON_FINAL",
                            "observations":observations})
            raw[match_id] = raw_player_stats
        self.assertEqual(pid-1,286)
        fake_identities = {
            "source_fixtures":9,"sourced_played":286,
            "matched_played":286,"unmatched_played":0,
            "matches":matches,
        }
        report = {"gameweek":8,"rows":[{"source_url":"https://www.fotmob.com/matches/example"} for _ in range(9)]}
        with patch("extract_mh8_fotmob_advanced.reconcile",return_value=fake_identities):
            result = build_advanced(report,raw,{},{},{})
        self.assertEqual(result["matched_played"],286)
        self.assertEqual(result["metric_coverage"],
                         {"xg":286,"xa":286,"shots":286,"shots_on_target":286,"key_passes":286})
        self.assertEqual(result["db_writes"],0)
        self.assertEqual(result["fantasy_points_written"],0)
        self.assertFalse(any("xfp" in x or "points" in x for x in result["rows"]))

    def test_refuses_unmatched_played_player(self):
        identities={"source_fixtures":9,"sourced_played":286,"matched_played":285,
                    "unmatched_played":1,"matches":[]}
        with patch("extract_mh8_fotmob_advanced.reconcile",return_value=identities):
            with self.assertRaises(ValueError):
                build_advanced({"rows":[]},{},{},{},{})


if __name__=="__main__":
    unittest.main()
