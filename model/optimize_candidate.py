"""Four-week Scout optimizer. No database writes."""
import json,sys,numpy as np
from scipy.optimize import milp,Bounds,LinearConstraint
from scipy.sparse import coo_matrix
from optimizer_rules import BUDGET,DISCOUNT_WEIGHTS,MAX_PER_CLUB,SQUAD_LIMITS,XI_BOUNDS,best_bench_order,captain_metric,cheap_bench_tiebreak,four_week_xfp,play_probability,week_projection
MAX_DEFENSIVE_STACK_PER_TEAM=2
def solve(players,alternative=False,avoid=(),max_defensive_stack_per_team=MAX_DEFENSIVE_STACK_PER_TEAM,current_ids=None,exact_transfers=None,bank=0,current_sell_prices=None):
 eligible=[p for p in players if float(p.get('price',0))>0 and max(play_probability(p,w) for w in range(4))>0];n=len(eligible)
 if not n:raise RuntimeError('No eligible players')
 current=set(map(int,current_ids or []));sell={int(k):float(v) for k,v in (current_sell_prices or {}).items()};ub=np.ones(3*n)
 for i,p in enumerate(eligible):
  now=week_projection(p)
  if now['xi']<.5 or now['minutes']<40 or now['availability']<=0:ub[i]=0
 c=np.zeros(3*n)
 for i,p in enumerate(eligible):
  ceil=.18*max(0,float(p.get('p90',week_projection(p)['xfp']))-week_projection(p)['xfp']) if alternative else 0
  c[i]=-(four_week_xfp(p)+ceil);c[n+i]=cheap_bench_tiebreak(p);c[2*n+i]=-captain_metric(p,alternative)
 rr=[];cc=[];dd=[];lo=[];hi=[]
 def add(terms,l,h):
  row=len(lo)
  for col,val in terms:rr.append(row);cc.append(col);dd.append(val)
  lo.append(l);hi.append(h)
 add([(i,1) for i in range(n)],11,11);add([(n+i,1) for i in range(n)],15,15);add([(2*n+i,1) for i in range(n)],1,1)
 if current:
  def curcost(p):return sell.get(int(p['id']),float(p['price'])) if int(p['id']) in current else float(p['price'])
  total=sum(sell.get(pid,next((float(p['price']) for p in eligible if int(p['id'])==pid),0)) for pid in current)
  add([(n+i,curcost(p)) for i,p in enumerate(eligible)],0,total+float(bank))
  if exact_transfers is not None:add([(n+i,1) for i,p in enumerate(eligible) if int(p['id']) not in current],int(exact_transfers),int(exact_transfers))
 else:add([(n+i,float(p['price'])) for i,p in enumerate(eligible)],0,BUDGET)
 for pos,amt in SQUAD_LIMITS.items():
  a,b=XI_BOUNDS[pos];ix=[i for i,p in enumerate(eligible) if p['position']==pos];add([(n+i,1) for i in ix],amt,amt);add([(i,1) for i in ix],a,b)
 for team in sorted({p['team'] for p in eligible}):
  ix=[i for i,p in enumerate(eligible) if p['team']==team];add([(n+i,1) for i in ix],0,MAX_PER_CLUB);add([(i,1) for i in ix if eligible[i]['position'] in ('GK','DEF')],0,max_defensive_stack_per_team)
 for i in range(n):add([(i,1),(n+i,-1)],-np.inf,0);add([(2*n+i,1),(i,-1)],-np.inf,0)
 if avoid:add([(i,1) for i,p in enumerate(eligible) if int(p['id']) in set(map(int,avoid))],0,8)
 A=coo_matrix((dd,(rr,cc)),shape=(len(lo),3*n)).tocsr();res=milp(c,integrality=np.ones(3*n),bounds=Bounds(0,ub),constraints=LinearConstraint(A,lo,hi),options={'time_limit':60,'mip_rel_gap':.003})
 if not res.success or res.x is None:raise RuntimeError('Optimizer did not reach a valid optimum: '+str(res.message))
 xi=[p for i,p in enumerate(eligible) if res.x[i]>.5];squad=[p for i,p in enumerate(eligible) if res.x[n+i]>.5];cap=next(p for i,p in enumerate(eligible) if res.x[2*n+i]>.5)
 bench=[p for p in squad if p not in xi];order,bev=best_bench_order(xi,bench);rank=sorted(xi,key=lambda p:(captain_metric(p),four_week_xfp(p)),reverse=True);vice=next(p for p in rank if int(p['id'])!=int(cap['id']))
 horizon=sum(four_week_xfp(p) for p in xi);objective=horizon+bev+captain_metric(cap)
 return {'variant':'alternative' if alternative else 'recommended','xi':[int(p['id']) for p in xi],'bench':[int(p['id']) for p in order],'bench_order':[int(p['id']) for p in order],'captain':int(cap['id']),'vice_captain':int(vice['id']),'budget':round(sum(float(p['price']) for p in squad),2),'xi_xfp':round(sum(week_projection(p)['xfp'] for p in xi),3),'four_week_xfp':round(horizon,3),'bench_expected_value':round(bev,4),'captain_metric':round(captain_metric(cap),4),'objective_4w':round(objective,4),'discount_weights':list(DISCOUNT_WEIGHTS),'formation':'-'.join(str(sum(p['position']==x for p in xi)) for x in ('DEF','MID','FWD')),'max_defensive_stack_per_team':max_defensive_stack_per_team,'solver':res.message}
if __name__=='__main__':
 with open(sys.argv[1],encoding='utf8') as f:players=json.load(f)
 main=solve(players);print(json.dumps([main,solve(players,True,main['xi'])],ensure_ascii=False))
