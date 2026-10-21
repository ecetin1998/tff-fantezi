#!/usr/bin/env python3
"""Compare GW7 vs GW8 verified FotMob *formation slot* candidates.

The two weeks have independent exact-source identity provenance. This is an
AUDIT, not Fantasy scoring, not heat-map/average on-field positions, and never
self-promotes player role records without a separate verified ingestion gate.
"""
from __future__ import annotations
import argparse,json,time,re
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
from audit_mh8_fotmob_sources import normalized
from probe_mh8_fotmob_structured import fetch_html,candidates,read_json,matches_tff
from audit_verified_tactical_layout import layout_role

BASE=Path('data/source-evidence')
XI=BASE/'gw7-fotmob-starting-xi-2026-10-12.json'
SCORES=BASE/'gw7-team-match-metrics-2026-10-13.json'
SCOUT=BASE/'gw7-player-scoring-staging-2026-10-12.json'
MINUTES=BASE/'gw7-player-season-delta-2026-10-13.json'

def load(path):return json.loads(Path(path).read_text(encoding='utf-8'))

def infer_team_backline(team):
    firstline=[p for p in team.get('starters') or [] if
        isinstance(p,dict) and isinstance(p.get('horizontalLayout'),dict) and
        isinstance(p['horizontalLayout'].get('x'),(float,int)) and
        .24<=p['horizontalLayout']['x']<=.415]
    return len(firstline) if len(firstline) in (3,4,5) else None

def collect_gw7(*,reader=read_json,fetcher=fetch_html,pause=True):
    xi=load(XI)['matches']
    scores={int(m['match_id']):m for m in load(SCORES)['matches']}
    squads={int(m['match_id']):m for m in load(SCOUT)['matches']}
    minute_rows={(int(x['match_id']),int(x['player_id'])):x
                 for x in load(MINUTES)['rows']}
    if len(xi)!=9 or len(scores)!=9 or len(squads)!=9 or len(minute_rows)<195:
        raise ValueError('historical source identity or fixture coverage incomplete')
    out,unmatched=[],[]
    for i,expected in enumerate(xi):
        if i and pause:time.sleep(1.2)
        mid=int(expected['match_id'])
        score=scores[mid];squad=squads[mid]
        wanted={'home_team':score['home'],'away_team':score['away'],
                'home_goals':int(score['goals'][0]),'away_goals':int(score['goals'][1])}
        # The MH8 reader intentionally accepts canonical /matches/ URLs only.
        # Historical GW7 manifests contain /tr/matches/ and /en-GB/matches/.
        # Normalize only that known FotMob locale prefix, never the hostname.
        requested=expected['source_url']
        if not requested.startswith('https://www.fotmob.com/'):
            raise ValueError('untrusted historical match source')
        canonical=requested.replace('https://www.fotmob.com/tr/matches/',
            'https://www.fotmob.com/matches/',1).replace(
            'https://www.fotmob.com/en-GB/matches/',
            'https://www.fotmob.com/matches/',1)
        if not canonical.startswith('https://www.fotmob.com/matches/'):
            raise ValueError('historical fixture URL is not an allowlisted FotMob match')
        html=fetcher(canonical)
        details=None
        for provider_id in candidates(html)[:3]:
            candidate=reader(provider_id)
            if matches_tff(candidate,wanted):
                details=candidate;break
        if details is None:raise ValueError('GW7 fixture source cannot verify '+str(mid))
        source_lineup=(details.get('content') or {}).get('lineup') or {}
        if not source_lineup:raise ValueError('GW7 missing lineup '+str(mid))
        for side,label,expected_names,team_name in (
           ('homeTeam','home',expected['home_starting_xi'],score['home']),
           ('awayTeam','away',expected['away_starting_xi'],score['away'])):
            team=source_lineup.get(side) or {}
            starters=team.get('starters') or []
            if len(starters)!=11:raise ValueError('GW7 must have full starting XI '+str(mid))
            historical_names={normalized(x) for x in expected_names}
            actual_names={normalized(str(p.get('name') or '')) for p in starters}
            # The historic frozen XI is an independent identity check. Refuse
            # fixture-level updates when more than two source names disagree.
            overlap=len(actual_names&historical_names)
            if overlap<9:raise ValueError('GW7 source XI mismatch '+str(mid)+' '+side)
            defense=infer_team_backline(team)
            for player in starters:
                name=normalized(str(player.get('name') or ''))
                if name not in historical_names:continue
                candidates_for_name=[x for x in squad['players']
                    if normalized(str(x.get('team') or ''))==normalized(str(team_name)) and
                    (normalized(str(x.get('display_name') or ''))==name or
                     normalized(str(x.get('full_name') or ''))==name)]
                if len(candidates_for_name)!=1:
                    unmatched.append({'match_id':mid,'source_name':player.get('name'),'reason':'identity_not_unique'})
                    continue
                historical=candidates_for_name[0]
                player_id=int(historical['player_id'])
                minute=minute_rows.get((mid,player_id))
                if not minute or not minute.get('started') or not (0<int(minute.get('played_minutes') or 0)<=130):
                    continue
                role=layout_role(player,defense)
                if role is None:
                    continue
                out.append({
                    'season':'2026-27','gameweek':7,'match_id':mid,
                    'player_id':player_id,'source_player_name':player.get('name'),
                    'provider_player_id':int(player['id']),
                    'started':True,'minutes':int(minute['played_minutes']),
                    'candidate_role':role['role'],'candidate_side':role['side'],
                    'source_position_label':role['source_position_label'],
                    'evidence_origin':role['origin'],'confidence':role['confidence'],
                    'source_match_url':expected['source_url'],
                    'evidence_status':'CANDIDATE_ONLY_NEEDS_INDEPENDENT_WEEK'
                })
    if len({(x['gameweek'],x['player_id']) for x in out})!=len(out):
        raise ValueError('duplicate GW7 canonical player')
    return {'kind':'GW7_SOURCE_CONFIRMED_LINEUP_SLOTS_READ_ONLY',
        'gameweek':7,'source_fixtures':9,'candidates':out,
        'unmatched':unmatched,'db_writes':0,'fantasy_points_written':0}

def compare(gw7,gw8):
    by7={int(x['player_id']):x for x in gw7['candidates']}
    current={int(x['player_id']):x for x in gw8['candidates']}
    matches,conflicts=[],[]
    for pid,p8 in current.items():
        p7=by7.get(pid)
        if not p7:continue
        item={'player_id':pid,'gw7':p7['candidate_role'],'gw8':p8['candidate_role'],
              'gw7_side':p7['candidate_side'],'gw8_side':p8['candidate_side'],
              'week7_fixture':p7['match_id'],'week8_fixture':p8['match_id']}
        if p7['candidate_role']==p8['candidate_role'] and p7['candidate_side']==p8['candidate_side']:
            matches.append(item)
        else:conflicts.append(item)
    return {'matched_two_week_roles':matches,'conflicting_roles':conflicts,
        'agreed':len(matches),'conflicting':len(conflicts)}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--mh8-source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    old=collect_gw7()
    new=load(args.mh8_source)
    if new.get('kind')!='READ_ONLY_TACTICAL_GEOMETRY_DIAGNOSTIC' or new.get('gameweek')!=8:
        raise ValueError('MH8 geometry report missing')
    pair=compare(old,new)
    report={'kind':'TWO_WEEK_VERIFIED_FORMATION_SLOT_AUDIT_READ_ONLY',
        'checked_at_utc':datetime.now(timezone.utc).isoformat(),
        'gw7_source_fixtures':old['source_fixtures'],'gw7_derived':len(old['candidates']),
        'gw8_derived':len(new['candidates']),**pair,
        'gw7_unmatched_names':old['unmatched'],
        'db_writes':0,'role_changes_written':0}
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('TWO-WEEK SOURCE AUDIT',report['gw7_derived'],'GW7',
        report['gw8_derived'],'GW8',report['agreed'],'SAME ROLE',
        report['conflicting'],'ROLE CONFLICTS',flush=True)
    print('ROLE CHANGES TO REVIEW '+json.dumps(report['conflicting_roles'],ensure_ascii=False)[:9000],flush=True)
    print('AGREED SAMPLE '+json.dumps(report['matched_two_week_roles'][:15],ensure_ascii=False),flush=True)

if __name__=='__main__':main()
