import itertools,json
from datetime import date,datetime
from pathlib import Path
RULES_PATH=Path(__file__).resolve().parents[1]/'rules'/'tff-fantasy.json'
with RULES_PATH.open(encoding='utf-8') as f:RULES=json.load(f)
FORMATIONS=set(RULES['formations']);BUDGET=float(RULES['budget']);SQUAD_LIMITS={k:int(v) for k,v in RULES['squad'].items()};MAX_PER_CLUB=int(RULES['max_per_club']);TRANSFER_RULES=RULES['transfers'];DISCOUNT_WEIGHTS=(1.0,.85,.72,.61)
def formation_counts(v):
 d,m,f=(int(x) for x in v.split('-'));return {'GK':1,'DEF':d,'MID':m,'FWD':f}
_FC=[formation_counts(v) for v in RULES['formations']]
XI_BOUNDS={p:(min(r[p] for r in _FC),max(r[p] for r in _FC)) for p in ('GK','DEF','MID','FWD')}
def _date(v):
 if not v:return None
 if isinstance(v,date):return v
 try:return datetime.fromisoformat(str(v).replace('Z','+00:00')).date()
 except ValueError:return None
def week_projection(p,w=0):
 weeks=p.get('weeks') or p.get('weekly') or [];r=weeks[w] if w<len(weeks) else {}
 x=float(r.get('xfp',p.get('xfp',0)));xi=float(r.get('xi',r.get('xi_probability',p.get('xi',0))));m=float(r.get('minutes',r.get('x_minutes',p.get('minutes',0))));a=float(r.get('availability',r.get('availability_probability',p.get('availability',1))))
 wd=_date(r.get('date') or r.get('deadline_at') or r.get('kickoff_at'));er=_date(p.get('expected_return_date'))
 if er and wd:a=0.0 if wd<er else max(a,float(p.get('return_availability',1)))
 return {'xfp':x,'xi':xi,'minutes':m,'availability':max(0,min(1,a))}
def play_probability(p,w=0):
 r=week_projection(p,w);return max(0,min(1,r['availability']*max(r['xi'],min(1,r['minutes']/90))))
def four_week_xfp(p):return sum(d*week_projection(p,w)['xfp']*play_probability(p,w) for w,d in enumerate(DISCOUNT_WEIGHTS))
def captain_metric(p,alternative=False):
 r=week_projection(p);base=float(p.get('p90',r['xfp'])) if alternative else r['xfp'];return base*play_probability(p)
def cheap_bench_tiebreak(p):return float(p['price'])*1e-4
def formation_of(players):
 c={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
 if c['GK']!=1:return None
 k=f"{c['DEF']}-{c['MID']}-{c['FWD']}";return k if k in FORMATIONS else None
def legal_squad(players):
 c={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
 if len(players)!=sum(SQUAD_LIMITS.values()) or c!=SQUAD_LIMITS:return False
 if sum(float(x['price']) for x in players)>BUDGET+.0001:return False
 tc={}
 for x in players:
  if 'team' in x:tc[x['team']]=tc.get(x['team'],0)+1
 return not tc or max(tc.values())<=MAX_PER_CLUB
def _out_subs(survivors,available,missing):
 out=[p for p in available if p['position']!='GK'];best=None
 for size in range(min(missing,len(out)),0,-1):
  for idx in itertools.combinations(range(len(out)),size):
   combo=[out[i] for i in idx]
   if formation_of(survivors+combo):
    if best is None or idx<best[0]:best=(idx,combo)
  if best:return best[1]
 return []
def auto_sub_probabilities(xi,bench,week=0):
 if len(xi)!=11 or len(bench)!=4:raise ValueError('XI/bench shape invalid')
 out={int(p['id']):0. for p in bench};xp=[play_probability(p,week) for p in xi];bp=[play_probability(p,week) for p in bench]
 for sm in range(1<<11):
  prob=1.;surv=[];miss=[]
  for i,p in enumerate(xi):
   on=bool(sm&(1<<i));prob*=xp[i] if on else 1-xp[i];(surv if on else miss).append(p)
  if prob<=1e-14 or not miss:continue
  for bm in range(1<<4):
   q=prob;avail=[]
   for j,p in enumerate(bench):
    on=bool(bm&(1<<j));q*=bp[j] if on else 1-bp[j]
    if on:avail.append(p)
   if q<=1e-14:continue
   chosen=[];cur=list(surv)
   if any(p['position']=='GK' for p in miss):
    g=next((p for p in avail if p['position']=='GK'),None)
    if g:chosen.append(g);cur.append(g)
   chosen+=_out_subs(cur,avail,sum(p['position']!='GK' for p in miss))
   for p in chosen:out[int(p['id'])]+=q
 return out
def bench_expected_value(xi,bench,week=0):
 pr=auto_sub_probabilities(xi,bench,week);return sum(pr[int(p['id'])]*week_projection(p,week)['xfp'] for p in bench)
def best_bench_order(xi,bench,week=0):
 best=None
 for order in itertools.permutations(bench):
  v=bench_expected_value(xi,list(order),week);ids=tuple(int(p['id']) for p in order);cand=(v,tuple(-x for x in ids),list(order))
  if best is None or cand[:2]>best[:2]:best=cand
 return best[2],best[0]
