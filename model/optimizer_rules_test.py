import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'model'))

from optimizer_rules import (  # noqa: E402
    BUDGET,FORMATIONS,MAX_PER_CLUB,SQUAD_LIMITS,
    best_bench_order,captain_metric,cheap_bench_tiebreak,expected_autosub_value,
    formation_of,legal_squad,lineup_metric,play_probability,
)

def test_captain_metric_modes():
    a={'position':'FWD','xfp':6.0,'p90':9.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
    b={'position':'MID','xfp':6.8,'p90':8.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
    assert captain_metric(b)>captain_metric(a)
    assert captain_metric(a)==6.0+.18*3.0
    assert captain_metric({**a,'position':'GK'})<0

def test_canonical_roster_and_formation():
    squad=[]
    pid=1
    for pos,count in [('GK',2),('DEF',5),('MID',5),('FWD',3)]:
        for _ in range(count):
            squad.append({'id':pid,'position':pos,'price':5.0})
            pid+=1
    assert legal_squad(squad)
    xi=[squad[0],*squad[2:6],*squad[7:11],*squad[12:14]]
    assert formation_of(xi)=='4-4-2'

def test_budget_neutral_lineup_and_cheap_bench_tiebreak():
    cheap={'position':'MID','xfp':6.0,'p90':8.0,'price':4.0}
    expensive={'position':'MID','xfp':6.0,'p90':8.0,'price':7.5}
    assert lineup_metric(cheap,False)==lineup_metric(expensive,False)
    assert lineup_metric(cheap,True)==lineup_metric(expensive,True)
    assert captain_metric(cheap)==captain_metric(expensive)
    assert cheap_bench_tiebreak(cheap)<cheap_bench_tiebreak(expensive)

def test_json_rule_parity_constants():
    assert BUDGET==100
    assert MAX_PER_CLUB==3
    assert SQUAD_LIMITS=={'GK':2,'DEF':5,'MID':5,'FWD':3}
    assert '4-4-2' in FORMATIONS


def test_exact_autosub_ev_respects_order_and_formation():
    def p(pid,pos,appearance=1.0,xfp=2.0,price=5.0,team=None):
        return {
            'id':pid,'position':pos,'appearance_probability':appearance,
            'xfp':xfp,'price':price,'team':team or pid,
        }

    xi=[
        p(1,'GK'),p(2,'DEF'),p(3,'DEF'),p(4,'DEF'),p(5,'DEF'),
        p(6,'MID'),p(7,'MID'),p(8,'MID'),p(9,'MID',appearance=.5),
        p(10,'FWD'),p(11,'FWD'),
    ]
    bench_gk=p(20,'GK',xfp=4)
    bench_def=p(21,'DEF',xfp=5)
    bench_mid=p(22,'MID',xfp=2)
    bench_fwd=p(23,'FWD',xfp=6)

    fwd_first=[bench_gk,bench_fwd,bench_mid,bench_def]
    mid_first=[bench_gk,bench_mid,bench_fwd,bench_def]
    assert abs(expected_autosub_value(xi,fwd_first)-3.0)<1e-9
    assert abs(expected_autosub_value(xi,mid_first)-1.0)<1e-9

    ordered,value=best_bench_order(xi,[bench_gk,bench_def,bench_mid,bench_fwd])
    assert ordered[0]['position']=='GK'
    assert ordered[1]['position']=='FWD'
    assert abs(value-3.0)<1e-9
    assert play_probability({'appearance_probability':.37})==.37
