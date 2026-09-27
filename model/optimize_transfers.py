import json,sys
from optimize_candidate import solve
from optimizer_rules import TRANSFER_RULES
def optimize_transfer_scenarios(payload):
 players=payload['players'];raw=payload.get('current_squad') or payload.get('current_ids') or []
 if raw and isinstance(raw[0],dict):ids=[int(x['id']) for x in raw];sell={int(x['id']):float(x.get('sell_price',x.get('price',0))) for x in raw}
 else:ids=list(map(int,raw));sell={int(k):float(v) for k,v in (payload.get('sell_prices') or {}).items()}
 if len(ids)!=15:raise ValueError('current_squad must contain 15 players')
 bank=float(payload.get('bank',0));free=max(0,min(int(payload.get('free_transfers',TRANSFER_RULES['free_per_week'])),int(TRANSFER_RULES['max_banked'])))
 base=solve(players,current_ids=ids,exact_transfers=0,bank=bank,current_sell_prices=sell);out=[]
 for n in range(4):
  try:
   s=base if n==0 else solve(players,current_ids=ids,exact_transfers=n,bank=bank,current_sell_prices=sell);hit=max(0,n-free)*int(TRANSFER_RULES['hit_cost']);gross=float(s['objective_4w'])-float(base['objective_4w']);out.append({'transfers':n,'hit_cost':hit,'gross_gain':round(gross,4),'net_gain':round(gross-hit,4),'squad':s})
  except RuntimeError as e:out.append({'transfers':n,'hit_cost':max(0,n-free)*int(TRANSFER_RULES['hit_cost']),'gross_gain':None,'net_gain':None,'error':str(e)})
 valid=[x for x in out if x['net_gain'] is not None]
 if valid:
  best=max(valid,key=lambda x:(x['net_gain'],-x['transfers']))
  for x in out:x['recommended']=x is best
 return out
if __name__=='__main__':
 with open(sys.argv[1],encoding='utf8') as f:p=json.load(f)
 print(json.dumps(optimize_transfer_scenarios(p),ensure_ascii=False))
