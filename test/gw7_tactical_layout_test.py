import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_gw7_tactical_layout import audit

class GW7TacticalSource(unittest.TestCase):
 def test_no_unverified_formation_accepted(self):
  with self.assertRaises(ValueError):
   audit({'gameweek':7,'matches':[{'match_id':317838}]},{},reader=lambda x:None)
 def test_bogus_match_id_rejected(self):
  nine=[{'match_id':319999} for _ in range(9)]
  with self.assertRaises(ValueError):
   audit({'gameweek':7,'matches':nine},{},reader=lambda x:None)

if __name__=='__main__':unittest.main()
