from optimizer_rules import captain_metric, bench_expected_value, cheap_bench_tiebreak, formation_of, legal_squad

a={'xfp':6.0,'p90':9.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
b={'xfp':6.8,'p90':8.0,'price':8.0,'xi':.95,'minutes':82,'availability':1}
assert captain_metric(b,False)>captain_metric(a,False)
assert captain_metric(a,True)>captain_metric(b,True)

squad=[]
pid=1
for pos,count in [('GK',2),('DEF',5),('MID',5),('FWD',3)]:
    for _ in range(count):
        squad.append({'id':pid,'position':pos,'price':5.0})
        pid+=1
assert legal_squad(squad)

xi=[squad[0],*squad[2:6],*squad[7:11],*squad[12:14]]
assert formation_of(xi)=='4-4-2'

usable={'xfp':4.0,'price':4.5,'xi':.8,'minutes':75,'availability':1}
risky={'xfp':4.0,'price':4.5,'xi':.2,'minutes':25,'availability':.7}
assert bench_expected_value(usable)>bench_expected_value(risky)
assert cheap_bench_tiebreak({'price':4.0})<cheap_bench_tiebreak({'price':7.5})

print('optimizer rule checks passed')
