import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_gw7_gw8_tactical_transitions import safe_role,compare
class Geometry(unittest.TestCase):
 def test_verified_advanced_right_winger(self):
  self.assertEqual(safe_role({'x':.678,'y':.875,'formation':'4-1-4-1'}),('W','R','advanced_flank_layout'))
 def test_right_wingback_not_misclassified_as_winger(self):
  self.assertEqual(safe_role({'x':.613,'y':.875,'formation':'3-4-3'})[0],'WB')
 def test_defender_position_does_not_dictate_real_tactical_role(self):
  self.assertEqual(safe_role({'x':.292,'y':.875,'formation':'4-2-3-1'})[0],'FB')
 def test_center_field_unknown_without_explicit_evidence(self):
  self.assertIsNone(safe_role({'x':.60,'y':.53,'formation':'4-2-3-1'}))
 def test_only_verified_two_consistent_appearances(self):
  x={'player_id':567,'team_id':18,'gameweek':7,'x':.678,'y':.875,'formation':'4-1-4-1',
      'match_id':317838,'position_id':82,'source_url':'https://www.fotmob.com/matches/a/123'}
  y={'player_id':567,'team_id':18,'gameweek':8,'horizontal_x':.678,'horizontal_y':.875,
      'formation':'4-1-4-1','match_id':317854,'provider_position_id':82,
      'provider_player_id':783806,'minutes':90}
  info=compare({'rows':[x],'verified_fixtures':9,'player_coordinates':1},
    {'raw_verified_starter_positions':[y],'verified_fixtures':9},
    {'players':[{'id':567,'full_name':'Deian Sorescu','position':'DEF'}]})
  self.assertEqual(info['two_week_supported_roles'],1)
  self.assertEqual(info['paired_candidates'][0]['fantasy_position'],'DEF')
  y['minutes']=25
  self.assertEqual(compare({'rows':[x],'verified_fixtures':9,'player_coordinates':1},
    {'raw_verified_starter_positions':[y],'verified_fixtures':9},
    {'players':[{'id':567,'full_name':'Deian Sorescu','position':'DEF'}]})['two_week_supported_roles'],0)
if __name__=='__main__':unittest.main()
