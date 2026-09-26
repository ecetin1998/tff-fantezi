"""Optimize a staged Scout squad from a reviewed player JSON snapshot.

Input is a JSON array with id, team, position, price, xfp, p90, xi, minutes,
availability. No database writes are performed here.
"""
import json
import sys
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix


def solve(players, alternative=False, avoid=()):
    eligible = [p for p in players if p['availability'] >= .8 and p['price'] > 0]
    n = len(eligible)
    ids = [p['id'] for p in eligible]
    pos = ['GK', 'DEF', 'MID', 'FWD']
    ub = np.ones(3*n)
    for i, p in enumerate(eligible):
        if p['xi'] < .5 or p['minutes'] < 40:
            ub[i] = 0
    c = np.zeros(3*n)
    for i, p in enumerate(eligible):
        base = p['xfp'] + (.18 * max(0, p['p90'] - p['xfp']) if alternative else 0)
        c[i] = -base
        c[n+i] = -p['xfp'] * 1e-5
        c[2*n+i] = -p['xfp']
    rr, cc, dd, lo, hi = [], [], [], [], []
    def add(terms, lower, upper):
        row = len(lo)
        for col, val in terms:
            rr.append(row); cc.append(col); dd.append(val)
        lo.append(lower); hi.append(upper)
    add([(i,1) for i in range(n)],11,11)
    add([(n+i,1) for i in range(n)],15,15)
    add([(2*n+i,1) for i in range(n)],1,1)
    add([(n+i,p['price']) for i,p in enumerate(eligible)],0,100)
    for position, amount, xi_min, xi_max in [('GK',2,1,1),('DEF',5,3,5),('MID',5,2,5),('FWD',3,1,3)]:
        ix=[i for i,p in enumerate(eligible) if p['position']==position]
        add([(n+i,1) for i in ix],amount,amount)
        add([(i,1) for i in ix],xi_min,xi_max)
    for team in sorted({p['team'] for p in eligible}):
        ix=[i for i,p in enumerate(eligible) if p['team']==team]
        add([(n+i,1) for i in ix],0,3)
        add([(i,1) for i in ix if eligible[i]['position'] in ('GK','DEF')],0,2)
    for i in range(n):
        add([(i,1),(n+i,-1)],-np.inf,0)
        add([(2*n+i,1),(i,-1)],-np.inf,0)
    if avoid:
        add([(i,1) for i,p in enumerate(eligible) if p['id'] in avoid],0,8)
    A=coo_matrix((dd,(rr,cc)),shape=(len(lo),3*n)).tocsr()
    result=milp(c,integrality=np.ones(3*n),bounds=Bounds(0,ub),constraints=LinearConstraint(A,lo,hi),options={'time_limit':60,'mip_rel_gap':.003})
    if result.x is None: raise RuntimeError('No legal squad: '+str(result.message))
    xi=[p for i,p in enumerate(eligible) if result.x[i]>.5]
    squad=[p for i,p in enumerate(eligible) if result.x[n+i]>.5]
    cap=next(p for i,p in enumerate(eligible) if result.x[2*n+i]>.5)
    if len(xi)!=11 or len(squad)!=15: raise RuntimeError('Invalid squad size')
    return {'variant':'alternative' if alternative else 'recommended','xi':[p['id'] for p in xi],
            'bench':[p['id'] for p in squad if p not in xi], 'captain':cap['id'],
            'budget':round(sum(p['price'] for p in squad),2),
            'xi_xfp':round(sum(p['xfp'] for p in xi),3),
            'captain_xfp':round(sum(p['xfp'] for p in xi)+cap['xfp'],3),
            'formation':'-'.join(str(sum(p['position']==position for p in xi)) for position in pos[1:]),
            'solver':result.message}

if __name__=='__main__':
    with open(sys.argv[1],encoding='utf8') as f: players=json.load(f)
    main=solve(players)
    alt=solve(players,True,main['xi'])
    print(json.dumps([main,alt],ensure_ascii=False))
