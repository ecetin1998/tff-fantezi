import json
from pathlib import Path

RULES_PATH=Path(__file__).resolve().parents[1]/'rules'/'tff-fantasy.json'
with RULES_PATH.open(encoding='utf-8') as handle:
    RULES=json.load(handle)

FORMATIONS=set(RULES['formations'])
BUDGET=float(RULES['budget'])
SQUAD_LIMITS={k:int(v) for k,v in RULES['squad'].items()}
MAX_PER_CLUB=int(RULES['max_per_club'])
CAPTAIN_LAMBDA=0.18

def formation_counts(value):
    d,m,f=(int(x) for x in value.split('-'))
    return {'GK':1,'DEF':d,'MID':m,'FWD':f}

_FORMATION_COUNTS=[formation_counts(value) for value in RULES['formations']]
XI_BOUNDS={
    pos:(min(row[pos] for row in _FORMATION_COUNTS),max(row[pos] for row in _FORMATION_COUNTS))
    for pos in ('GK','DEF','MID','FWD')
}

def lineup_metric(player, alternative=False):
    xfp=float(player['xfp'])
    if not alternative:
        return xfp
    p90=float(player.get('p90',xfp))
    return xfp+CAPTAIN_LAMBDA*max(0.0,p90-xfp)

def captain_metric(player):
    if player.get('position')=='GK':
        return -1e9
    xfp=float(player['xfp'])
    p90=float(player.get('p90',xfp))
    return xfp+CAPTAIN_LAMBDA*max(0.0,p90-xfp)

def cheap_bench_tiebreak(player):
    return float(player['price']) * 1e-4

def formation_of(players):
    counts={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
    if counts['GK'] != XI_BOUNDS['GK'][0]:
        return None
    key=f"{counts['DEF']}-{counts['MID']}-{counts['FWD']}"
    return key if key in FORMATIONS else None

def legal_squad(players):
    counts={p:sum(1 for x in players if x['position']==p) for p in ('GK','DEF','MID','FWD')}
    if len(players)!=sum(SQUAD_LIMITS.values()) or counts!=SQUAD_LIMITS:
        return False
    if sum(float(x['price']) for x in players)>BUDGET+.0001:
        return False
    if all('team' in x for x in players):
        team_counts={}
        for player in players:
            team_counts[player['team']]=team_counts.get(player['team'],0)+1
        if max(team_counts.values(),default=0)>MAX_PER_CLUB:
            return False
    return True
