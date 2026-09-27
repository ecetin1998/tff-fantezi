import json
from pathlib import Path

RULES_PATH=Path(__file__).resolve().parents[1]/'rules'/'tff-fantasy.json'
with RULES_PATH.open(encoding='utf8') as _f:
    RULES=json.load(_f)

FORMATIONS=set(RULES['formations'])
SQUAD={k:int(v) for k,v in RULES['squad'].items()}
BUDGET=float(RULES['budget'])
MAX_PER_CLUB=int(RULES['max_per_club'])
MAX_DEFENSIVE_STACK_PER_TEAM=int(RULES.get('optimizer',{}).get('max_defensive_stack_per_team',2))

def captain_metric(player, alternative=False):
    return float(player['p90'] if alternative else player['xfp'])

def bench_expected_value(player):
    appearance=max(float(player.get('xi',0)), min(1.0,float(player.get('minutes',0))/90.0))
    play_probability=max(0.0,min(1.0,float(player.get('availability',1))*appearance))
    return 0.08*play_probability*float(player.get('xfp',0))

def cheap_bench_tiebreak(player):
    return float(player['price']) * 1e-4

def formation_of(players):
    counts={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
    if counts['GK'] != 1:
        return None
    key=f"{counts['DEF']}-{counts['MID']}-{counts['FWD']}"
    return key if key in FORMATIONS else None

def legal_squad(players):
    counts={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
    clubs={}
    for player in players:
        clubs[player['team']]=clubs.get(player['team'],0)+1
    return (
        len(players)==sum(SQUAD.values())
        and counts==SQUAD
        and sum(float(x['price']) for x in players)<=BUDGET+0.0001
        and all(n<=MAX_PER_CLUB for n in clubs.values())
    )
