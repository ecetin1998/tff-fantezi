import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'model'))

from optimizer_rules import (  # noqa: E402
    BUDGET,FORMATIONS,MAX_PER_CLUB,SQUAD_LIMITS,
    bench_expected_value,budget_spend_reward,captain_metric,cheap_bench_tiebreak,formation_of,legal_squad,
)

def test_captain_metric_modes():
    a={'position':'FWD','xfp':6.0,'p90':9.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
    b={'position':'MID','xfp':6.8,'p90':8.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
    assert captain_metric(b,False)>captain_metric(a,False)
    assert captain_metric(a,False)==6.0+.18*3.0
    assert captain_metric({**a,'position':'GK'},False)<0

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

def test_bench_value_and_price_tiebreak():
    usable={'xfp':4.0,'price':4.5,'xi':.8,'minutes':75,'availability':1}
    risky={'xfp':4.0,'price':4.5,'xi':.2,'minutes':25,'availability':.7}
    assert bench_expected_value(usable)>bench_expected_value(risky)
    assert cheap_bench_tiebreak({'price':4.0})<cheap_bench_tiebreak({'price':7.5})
    assert budget_spend_reward({'price':7.5})>budget_spend_reward({'price':4.0})

def test_json_rule_parity_constants():
    assert BUDGET==100
    assert MAX_PER_CLUB==3
    assert SQUAD_LIMITS=={'GK':2,'DEF':5,'MID':5,'FWD':3}
    assert '4-4-2' in FORMATIONS
