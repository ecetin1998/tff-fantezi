import json
from itertools import permutations
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

def captain_metric(player, alternative=False):
    if player.get('position')=='GK':
        return -1e9
    xfp=float(player['xfp'])
    if not alternative:
        return xfp
    p90=float(player.get('p90',xfp))
    return xfp+CAPTAIN_LAMBDA*max(0.0,p90-xfp)

def cheap_bench_tiebreak(player):
    return float(player['price']) * 1e-4

def play_probability(player):
    explicit=player.get('appearance_probability',player.get('appearance'))
    if explicit is not None:
        return max(0.0,min(1.0,float(explicit)))
    xi=float(player.get('xi',0))
    minutes=float(player.get('minutes',0))
    availability=float(player.get('availability',1))
    return max(0.0,min(1.0,availability*max(xi,min(1.0,minutes/90.0))))

def conditional_xfp(player):
    probability=play_probability(player)
    return float(player.get('xfp',0))/probability if probability>1e-9 else 0.0

def _formation_key_from_counts(counts):
    if counts.get('GK',0)!=1:
        return None
    key=f"{counts.get('DEF',0)}-{counts.get('MID',0)}-{counts.get('FWD',0)}"
    return key if key in FORMATIONS else None

def _starter_absence_distribution(xi):
    positions=('GK','DEF','MID','FWD')
    distribution={(0,0,0,0):1.0}
    for player in xi:
        idx=positions.index(player['position'])
        no_play=1.0-play_probability(player)
        next_distribution={}
        for state,probability in distribution.items():
            next_distribution[state]=next_distribution.get(state,0.0)+probability*(1.0-no_play)
            absent=list(state);absent[idx]+=1;absent=tuple(absent)
            next_distribution[absent]=next_distribution.get(absent,0.0)+probability*no_play
        distribution=next_distribution
    return distribution

def expected_autosub_value(xi,ordered_bench):
    if len(xi)!=11 or len(ordered_bench)!=4:
        return 0.0
    positions=('GK','DEF','MID','FWD')
    initial_counts={pos:sum(1 for p in xi if p['position']==pos) for pos in positions}
    if not _formation_key_from_counts(initial_counts):
        return 0.0
    goalkeeper=next((p for p in ordered_bench if p['position']=='GK'),None)
    outfield=[p for p in ordered_bench if p['position']!='GK']
    if goalkeeper is None or len(outfield)!=3:
        return 0.0
    bench=[goalkeeper,*outfield]
    play=[play_probability(p) for p in bench]
    conditional=[conditional_xfp(p) for p in bench]
    total=0.0
    for absent_state,starter_probability in _starter_absence_distribution(xi).items():
        if starter_probability<=0:
            continue
        absent={pos:absent_state[i] for i,pos in enumerate(positions)}
        for mask in range(1<<4):
            probability=starter_probability
            played=[]
            for i,p in enumerate(play):
                is_playing=bool(mask&(1<<i))
                probability*=p if is_playing else (1.0-p)
                played.append(is_playing)
            if probability<=0:
                continue
            value=0.0
            if absent['GK']>0 and played[0]:
                value+=conditional[0]
            missing={pos:absent[pos] for pos in ('DEF','MID','FWD')}
            counts=dict(initial_counts)
            for bench_index,player in enumerate(outfield,start=1):
                if not played[bench_index] or sum(missing.values())<=0:
                    continue
                replacement=None
                candidates=[player['position'],*('DEF','MID','FWD')]
                seen=set()
                for replaced_pos in candidates:
                    if replaced_pos in seen or missing.get(replaced_pos,0)<=0:
                        continue
                    seen.add(replaced_pos)
                    trial=dict(counts)
                    trial[replaced_pos]-=1
                    trial[player['position']]+=1
                    if _formation_key_from_counts(trial):
                        replacement=replaced_pos
                        counts=trial
                        break
                if replacement is not None:
                    missing[replacement]-=1
                    value+=conditional[bench_index]
            total+=probability*value
    return total

def best_bench_order(xi,bench):
    goalkeeper=next((p for p in bench if p['position']=='GK'),None)
    outfield=[p for p in bench if p['position']!='GK']
    if goalkeeper is None or len(outfield)!=3:
        return list(bench),0.0
    best_order=None
    best_value=-1.0
    for order in permutations(outfield):
        candidate=[goalkeeper,*order]
        value=expected_autosub_value(xi,candidate)
        if value>best_value+1e-12:
            best_order,best_value=candidate,value
    return best_order,best_value

def _shortlist_bench_candidates(candidates,bench):
    out={p['id']:p for p in bench}
    for pos in ('GK','DEF','MID','FWD'):
        rows=[p for p in candidates if p['position']==pos]
        groups=[
            sorted(rows,key=lambda p:(-float(p.get('xfp',0)),float(p.get('price',0))))[:6],
            sorted(rows,key=lambda p:(float(p.get('price',0)),-float(p.get('xfp',0))))[:6],
            sorted(rows,key=lambda p:(
                -(float(p.get('xfp',0))/float(p.get('price',1)) if float(p.get('price',0))>0 else 0),
                -float(p.get('xfp',0))
            ))[:6],
        ]
        for group in groups:
            for player in group:
                out[player['id']]=player
    return list(out.values())

def optimize_bench_for_autosubs(xi,bench,candidates):
    shortlist=_shortlist_bench_candidates(candidates,bench)
    current,current_value=best_bench_order(xi,bench)
    selected_ids={p['id'] for p in xi+current}
    for _ in range(4):
        best=current
        best_value=current_value
        best_cost=sum(float(p['price']) for p in current)
        for slot,old in enumerate(current):
            for candidate in shortlist:
                if candidate['position']!=old['position'] or candidate['id'] in selected_ids:
                    continue
                trial=list(current);trial[slot]=candidate
                if not legal_squad(xi+trial):
                    continue
                ordered,value=best_bench_order(xi,trial)
                cost=sum(float(p['price']) for p in ordered)
                if value>best_value+1e-9 or (abs(value-best_value)<=1e-9 and cost<best_cost-1e-9):
                    best,best_value,best_cost=ordered,value,cost
        if [p['id'] for p in best]==[p['id'] for p in current]:
            break
        current,current_value=best,best_value
        selected_ids={p['id'] for p in xi+current}
    return current,current_value

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
