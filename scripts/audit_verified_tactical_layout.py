#!/usr/bin/env python3
"""Read-only GW7+GW8 football lineup geometry audit.

This is a *source-confirmed lineup slot*, NOT optical tracking, not a
registered Fantasy position and not verified on-pitch movement. Infer a
candidate tactical role only from FotMob's normalized layout, with an
unambiguous pitch line and side. Promotion requires two different source
fixtures in the previous two weeks agreeing (enforced by model).
"""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter,defaultdict
from audit_mh8_tactical_roles import collect as collect_mh8,explicit_role
from extract_mh8_fotmob_advanced import read_verified_fixture
from reconcile_mh8_provider_players import (ROSTER,OFFICIAL,REVIEWED,REVIEWED_PRIOR)
from probe_mh8_fotmob_structured import (MANIFEST,candidates,read_json,matches_tff,fetch_html)
from audit_mh8_fotmob_sources import normalized

GW7_LINEUPS=Path('data/source-evidence/gw7-fotmob-starting-xi-2026-10-12.json')
GW7_SCORES=Path('data/source-evidence/gw7-team-match-metrics-2026-10-13.json')
GW7_PLAYER_IDS=Path('data/source-evidence/gw7-player-scoring-staging-2026-10-12.json')
RELIABLE_ROLES={'GK','CB','FB','WB','DM','CM','AM','WM','W','ST'}

def layout_role(entry,team_defenders=None):
    """Classify only unambiguous FotMob formation slots.

    Deep defensive flanks and center-backs are separated using the team
    back-line count; attacking flanks at x>=.60 are wingers, regardless of
    *registered* Fantasy DEF/MID/FWD scoring category.
    """
    explicit=explicit_role(entry)
    if explicit is not None:
        return {**explicit,'origin':'explicit_provider_text','confidence':'high'}
    layout=entry.get('horizontalLayout')
    if not isinstance(layout,dict):
        return None
    x,y=layout.get('x'),layout.get('y')
    if not all(isinstance(v,(int,float)) and not isinstance(v,bool) for v in (x,y)):
        return None
    if not (0<=x<=1 and 0<=y<=1):
        return None
    flankR=y>=.77; flankL=y<=.23
    side='R' if flankR else 'L' if flankL else 'C'
    # Very wide first-line defenders in a back four can safely be fullbacks.
    if x<.19 and .35<=y<=.65:
        role='GK'
    elif .25<=x<=.41:
        if team_defenders==4 and (flankR or flankL):
            role='FB'
        elif team_defenders==3 and not(flankR or flankL):
            role='CB'
        elif team_defenders==4 and not(flankR or flankL):
            role='CB'
        else:
            return None
    elif .43<=x<=.54:
        if flankR or flankL:
            # Outside mids are either wingback/wing-mid; tactical formation
            # confirmation is needed before choosing one.
            if team_defenders==3:
                role='WB'
            else:
                role='WM'
        elif .36<=y<=.64:
            role='DM'
        else:
            role='CM'
    elif .59<=x<=.71:
        if flankR or flankL:
            role='W'
        elif .37<=y<=.63:
            role='AM'
        else:
            role='AM'
    elif .79<=x<=.93:
        role='W' if flankR or flankL else 'ST'
    else:
        return None
    return {'role':role,'side':side,'origin':'provider_lineup_geometry',
            'confidence':'medium',
            'source_position_label':f'layout:x={x:.3f},y={y:.3f},defenders={team_defenders}',
            'source_field':'horizontalLayout'}

def defender_count(team):
    back=[p for p in (team.get('starters') or [])
          if isinstance(p,dict) and isinstance(p.get('horizontalLayout'),dict)
          and isinstance(p['horizontalLayout'].get('x'),(int,float))
          and .24<=p['horizontalLayout']['x']<=.415]
    if len(back) not in (3,4,5):
        return None
    return len(back)

def source_season_lattice(entry,match_id,season_week,observed_ids,source_url):
    lineup=(entry.get('content') or {}).get('lineup') or {}
    result=[]
    for side in ('homeTeam','awayTeam'):
        team=lineup.get(side) or {}
        defense=defender_count(team)
        for player in team.get('starters') or []:
            if not isinstance(player,dict):
                continue
            pid=player.get('id')
            if not isinstance(pid,(int,str)) or not str(pid).isdigit():
                continue
            evidence=observed_ids.get((match_id,int(pid)))
            if not evidence:
                continue
            pos=layout_role(player,defense)
            if pos is None:
                continue
            result.append({
                'season':'2026-27','gameweek':season_week,'match_id':match_id,
                'player_id':evidence['player_id'],'team_id':evidence['team_id'],
                'provider_player_id':int(pid),'started':True,'minutes':evidence['minutes'],
                'verified':True,'role':pos['role'],'side':pos['side'],
                'confidence':pos['confidence'],'evidence_origin':pos['origin'],
                'source_position_label':pos['source_position_label'],
                'source_match_url':source_url
            })
    return result

def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def gw7_audit(reader=None,fetcher=fetch_html):
    lineups=load(GW7_LINEUPS)['matches']
    scores={int(m['match_id']):m for m in load(GW7_SCORES)['matches']}
    historical={int(m['match_id']):m for m in load(GW7_PLAYER_IDS)['matches']}
    if len(lineups)!=9 or len(scores)!=9 or len(historical)!=9:
        raise ValueError('GW7 full 9 match contract required')
    output=[]
    for i,expected in enumerate(lineups):
        mid=int(expected['match_id']);score=scores[mid];prior=historical[mid]
        if i:
            time.sleep(1.1)
        match={'home_team':score['home'],'away_team':score['away'],
               'home_goals':score['goals'][0],'away_goals':score['goals'][1]}
        html=fetcher(expected['source_url'])
        provider=None
        for fid in candidates(html)[:3]:
            raw=(reader or read_json)(fid)
            if matches_tff(raw,match):
                provider=raw
                break
        if provider is None:
            raise ValueError(f'GW7 FotMob match not independently verified {mid}')
        observed={}
        # Canonical Scout ID comes only from the exact verified historical
        # scorer participant, NOT a guessed current squad or surname alias.
        for historical_player in prior['players']:
            name=normalized(str(historical_player.get('display_name') or ''))
            if not name:
                continue
        team_data=(provider.get('content') or {}).get('lineup') or {}
        for team_side,expected_names in (('homeTeam',expected['home_starting_xi']),
                                         ('awayTeam',expected['away_starting_xi'])):
            src=team_data.get(team_side) or {}
            # Validate source starters against original full-time published
            # GW7 starting XI. Ambiguous name matches fail the full audit.
            have={normalized(str(p.get('name') or '')) for p in src.get('starters') or []}
            expected_name_set={normalized(n) for n in expected_names}
            if have!=expected_name_set:
                raise ValueError(f'GW7 starting XI source mismatch {mid}:{team_side}')
            for p in src.get('starters') or []:
                nm=normalized(str(p.get('name') or ''))
                same=[x for x in prior['players'] if
                    normalized(str(x.get('display_name') or ''))==nm
                    or normalized(str(x.get('full_name') or ''))==nm]
                if len(same)!=1:
                    continue
                target=same[0]
                observed[(mid,int(p['id']))]={
                    'player_id':int(target['player_id']),
                    # Team IDs resolved separately from historic participant data.
                    'team_id':None,'minutes':int(target.get('appearance_minutes_proxy') or 0)}
        # Never insert rows with unverified team IDs or proxy minutes into
        # the authoritative tactical observation table.
        items=source_season_lattice(provider,mid,7,observed,expected['source_url'])
        for item in items:
            item['verified']=False
            item['evidence_origin']+=':gw7_proxy_minutes'
        output.extend(items)
    return output

def mh8_audit(reader=read_verified_fixture):
    manifest=load(MANIFEST);roster=load(ROSTER)
    official=load(OFFICIAL);reviewed=load(REVIEWED);prior=load(REVIEWED_PRIOR)
    results=collect_mh8(manifest,roster,official,reviewed,prior,reader)
    ids={int(p['id']):p for p in roster['players']}
    positions=results.get('raw_verified_starter_positions') or []
    # Legacy audit returns a position-only layout sample; on-disk source for
    # full per-formation team context must be revisited before promotion.
    return results,positions

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    mh8,placements=mh8_audit()
    # Further GW7 reconciliation is diagnostic; no DB writes are permitted.
    output={'kind':'READ_ONLY_TACTICAL_GEOMETRY_DIAGNOSTIC',
            'season':'2026-27','gameweek':8,'played_mh8':mh8['matched_played'],
            'mh8_layout_coverage':mh8['source_layout_coverage'],
            'provider_position_ids':Counter(str(p['provider_position_id']) for p in placements),
            'missing_role_labels':mh8['unknown_explicit_role_labels'],
            'db_writes':0,'role_changes_written':0,
            'created_at':datetime.now(timezone.utc).isoformat()}
    args.output.write_text(json.dumps(output,indent=2,default=dict)+'\n',encoding='utf-8')
    print('MH8 GEOMETRY DIAGNOSTIC verified layouts',output['mh8_layout_coverage'],
          'out of',len(placements),'DB writes 0',flush=True)

if __name__=='__main__':
    main()
