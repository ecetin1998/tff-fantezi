FORMATIONS={'3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1'}

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
    return len(players)==15 and counts=={'GK':2,'DEF':5,'MID':5,'FWD':3} and sum(float(x['price']) for x in players)<=100.0001
