import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_verified_tactical_layout import layout_role
from audit_gw7_gw8_tactical_roles import compare

class GeometryRoleTest(unittest.TestCase):
 def test_source_wingback_vs_winger_and_fantasy_registration(self):
  case=lambda x,y:layout_role({'horizontalLayout':{'x':x,'y':y}},4)
  self.assertEqual(case(.678,.875)['role'],'W')
  self.assertEqual(case(.678,.875)['side'],'R')
  self.assertEqual(case(.485,.875)['role'],'WM')
  self.assertEqual(layout_role({'horizontalLayout':{'x':.485,'y':.875}},3)['role'],'WB')
  self.assertEqual(case(.357,.5)['role'],'CB')
  self.assertEqual(case(.292,.875)['role'],'FB')
  self.assertEqual(case(.87,.5)['role'],'ST')
 def test_ambiguous_coords_refused(self):
  for coordinates in ({},{'x':.2,'y':.5},{'x':2,'y':.4},{'x':.35,'y':.91}):
   self.assertIsNone(layout_role({'horizontalLayout':coordinates},None))
 def test_match_consensus_requires_same_role_and_side(self):
  a={'candidates':[{'player_id':567,'candidate_role':'W','candidate_side':'R','match_id':317838},
                   {'player_id':299,'candidate_role':'WB','candidate_side':'R','match_id':317839}]}
  b={'candidates':[{'player_id':567,'candidate_role':'W','candidate_side':'R','match_id':317854},
                   {'player_id':299,'candidate_role':'FB','candidate_side':'R','match_id':317853}]}
  result=compare(a,b)
  self.assertEqual(result['agreed'],1)
  self.assertEqual(result['conflicting'],1)
  self.assertEqual(result['matched_two_week_roles'][0]['player_id'],567)
if __name__=='__main__':unittest.main()
