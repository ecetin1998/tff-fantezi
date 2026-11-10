import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from reconcile_gw11_verified_advanced import pick_player
class IdentityTest(unittest.TestCase):
 def test_prior_identity_requires_same_fixture_team(self):
  r={"known_provider_player_id":321,"full_name":"Player One"}
  self.assertEqual(pick_player(r,{321:{"name":"X"}},set()),(321,"prior_source_provider_id"))
  self.assertEqual(pick_player(r,{322:{"name":"X"}},set()),(None,"unmatched_or_ambiguous"))
 def test_unique_exact_name_only(self):
  r={"known_provider_player_id":0,"full_name":"A. Player","display_name":"A Player","short_label":""}
  self.assertEqual(pick_player(r,{1:{"name":"A Player"}},set()),(1,"exact_name_within_verified_team"))
  self.assertEqual(pick_player(r,{1:{"name":"A Player"},2:{"name":"A Player"}},set()),(None,"unmatched_or_ambiguous"))
if __name__=="__main__":unittest.main()
