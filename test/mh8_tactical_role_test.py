import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_mh8_tactical_roles import explicit_role,collect

class RoleEvidenceTest(unittest.TestCase):
  def test_explicit_right_wing_and_right_wingback(self):
    self.assertEqual(explicit_role({'positionStringShort':'RW'})['role'],'W')
    self.assertEqual(explicit_role({'positionStringShort':'RW'})['side'],'R')
    self.assertEqual(explicit_role({'positionStringShort':'RWB'})['role'],'WB')
    self.assertEqual(explicit_role({'localizedPosition':{'key':'CAM'}})['role'],'AM')
    self.assertEqual(explicit_role({'position':'LCB'})['side'],'L')

  def test_never_guess_numeric_position_id_or_unknown_shape(self):
    for x in ({'positionId':11},{'positionId':7},{'position':'Substitute'},
              {'localizedPosition':{'key':'something'}},{}):
      self.assertIsNone(explicit_role(x))

  def test_reject_partial_fixtures(self):
    with self.assertRaises(ValueError):
      collect({'gameweek':8,'matches':[{'match_id':1}]},{},{},{},{},
              reader=lambda x:None)

if __name__=='__main__':unittest.main()
