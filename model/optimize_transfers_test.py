import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'model'))
from optimize_transfers import optimize_transfer_scenarios
def test_scenarios():
 ps=[];i=1
 for pos,n in [('GK',4),('DEF',10),('MID',10),('FWD',6)]:
  for j in range(n):ps.append({'id':i,'team':(i%10)+1,'position':pos,'price':4+(j%3)*.5,'xfp':3+j*.15,'p90':5+j*.2,'xi':.9,'minutes':80,'availability':1});i+=1
 cur=[]
 for pos,n in [('GK',2),('DEF',5),('MID',5),('FWD',3)]:cur += [p['id'] for p in ps if p['position']==pos][:n]
 out=optimize_transfer_scenarios({'players':ps,'current_ids':cur,'bank':5,'free_transfers':1});assert [x['transfers'] for x in out]==[0,1,2,3];assert sum(bool(x.get('recommended')) for x in out)==1;assert out[2]['hit_cost']==4 and out[3]['hit_cost']==8
