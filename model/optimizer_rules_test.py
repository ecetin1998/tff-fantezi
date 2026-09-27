import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'model'))
from optimizer_rules import *
def p(i,pos,xfp=4,xi=.9,minutes=80,availability=1,price=5,team=1):return {'id':i,'position':pos,'xfp':xfp,'p90':xfp+2,'xi':xi,'minutes':minutes,'availability':availability,'price':price,'team':team}
def test_captain_metric_play_probability():
 assert captain_metric(p(1,'MID',6,.95))>captain_metric(p(2,'MID',7,.3,30))
def test_four_week_return_date():
 a=p(1,'MID');a['weeks']=[{'date':f'2026-10-{d:02d}','xfp':5,'xi':1,'minutes':90,'availability':1} for d in (1,8,15,22)];assert four_week_xfp(a)>5;a['expected_return_date']='2026-10-15';assert play_probability(a,0)==0 and play_probability(a,2)>0
def test_roster_formation():
 s=[];i=1
 for pos,n in [('GK',2),('DEF',5),('MID',5),('FWD',3)]:
  for _ in range(n):s.append(p(i,pos,price=5,team=(i%5)+1));i+=1
 assert legal_squad(s);assert formation_of([s[0],*s[2:6],*s[7:11],*s[12:14]])=='4-4-2'
def test_auto_sub_gk():
 xi=[p(1,'GK',xi=0,minutes=0),*[p(i,'DEF') for i in range(2,6)],*[p(i,'MID') for i in range(6,10)],*[p(i,'FWD') for i in range(10,12)]];b=[p(20,'GK'),p(21,'MID'),p(22,'DEF'),p(23,'FWD')];pr=auto_sub_probabilities(xi,b);assert pr[20]>.8;order,val=best_bench_order(xi,b);assert len(order)==4 and val>=0
def test_constants():
 assert BUDGET==100 and MAX_PER_CLUB==3 and SQUAD_LIMITS=={'GK':2,'DEF':5,'MID':5,'FWD':3} and tuple(DISCOUNT_WEIGHTS)==(1.,.85,.72,.61)
