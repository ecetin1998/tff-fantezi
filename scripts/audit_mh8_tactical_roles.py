#!/usr/bin/env python3
"""Audit *explicit* MH8 FotMob starting tactical positions, read-only.
Never infer tactical role from numeric positionId, player profile or fantasy slot.
Identity matches official TFF-to-Scout roster crosswalk and the actual fixture.
No database writes, no guessed roles and no score changes.
"""
from __future__ import annotations
import argparse
import json
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
from extract_mh8_fotmob_advanced import read_verified_fixture
from reconcile_mh8_provider_players import (
    ROSTER,OFFICIAL,REVIEWED,REVIEWED_PRIOR,reconcile
)
from probe_mh8_fotmob_structured import MANIFEST

ALIASES={
 'GK':('GK',None),'GOALKEEPER':('GK',None),
 'CB':('CB',None),'LCB':('CB','L'),'RCB':('CB','R'),
 'LB':('FB','L'),'RB':('FB','R'),'LWB':('WB','L'),'RWB':('WB','R'),
 'CDM':('DM','C'),'DM':('DM','C'),'LDM':('DM','L'),'RDM':('DM','R'),
 'CM':('CM','C'),'LCM':('CM','L'),'RCM':('CM','R'),
 'CAM':('AM','C'),'AM':('AM','C'),'LAM':('AM','L'),'RAM':('AM','R'),
 'LM':('WM','L'),'RM':('WM','R'),
 'LW':('W','L'),'RW':('W','R'),
 'LF':('W','L'),'RF':('W','R'),
 'CF':('ST','C'),'ST':('ST','C'),'SS':('SS','C')
}
def explicit_role(player):
    """Accept the lineup's literal football-position label only."""
    for field in ('positionStringShort','localizedPosition','position'):
        raw=player.get(field)
        if isinstance(raw,dict):
            raw=raw.get('key') or raw.get('label')
        if not isinstance(raw,str):
            continue
        key=raw.upper().replace('-','').replace('_','').replace(' ','').strip()
        if key in ALIASES:
            role,side=ALIASES[key]
            return {'role':role,'side':side,'source_position_label':raw,'source_field':field}
    return None

def collect(manifest,roster,official,reviewed,prior,reader=read_verified_fixture):
    entries=manifest.get('matches') or []
    if manifest.get('gameweek')!=8 or len(entries)!=9 or len({m['match_id'] for m in entries})!=9:
        raise ValueError('MH8 needs nine distinct fixtures')
    reports,detail_by_match=[],{}
    for item in entries:
        record,details=reader(item)
        if record.get('status')!='STRUCTURED_FIXTURE_CONFIRMED' or not record['data'].get('lineup_complete'):
            raise ValueError('unverified lineup')
        reports.append(record)
        detail_by_match[int(item['match_id'])]=details
    reviewed_all={'gameweek':8,'entries':reviewed['entries']+prior['entries']}
    identities=reconcile({'gameweek':8,'rows':reports},roster,reviewed_all,official)
    if (identities['source_fixtures']!=9 or identities['sourced_played']!=286 or
        identities['matched_played']!=286 or identities['unmatched_played']!=0):
        raise ValueError('incomplete official player identity alignment')
    out,unknown,placements=[],Counter(),[]
    for match in identities['matches']:
        match_id=int(match['match_id'])
        proof={int(o['provider_player_id']):o for o in match['observations']
               if o['scout_player_id'] is not None and o['played_from_explicit_minutes']}
        src=detail_by_match[match_id].get('content',{}).get('lineup') or {}
        by_id={}
        for side in ('homeTeam','awayTeam'):
            formation=(src.get(side) or {}).get('formation')
            for starter in (src.get(side) or {}).get('starters') or []:
                if not isinstance(starter,dict):
                    continue
                pid=starter.get('id')
                if isinstance(pid,(int,str)) and str(pid).isdigit():
                    by_id[int(pid)]={**starter,'_formation':formation}
        for provider_id,obs in proof.items():
            starter=by_id.get(provider_id)
            if starter is None:
                continue # substitute minutes are not evidence of a starting role
            layout=starter.get('horizontalLayout') or {}
            x=layout.get('x') if isinstance(layout,dict) else None
            y=layout.get('y') if isinstance(layout,dict) else None
            placements.append({'player_id':int(obs['scout_player_id']),
              'match_id':match_id,'provider_position_id':starter.get('positionId'),
              'horizontal_x':x,'horizontal_y':y,
              'source_position_short':starter.get('positionStringShort'),
              'formation':starter.get('_formation'),
              'team_id':int(obs['team_id']),
              'provider_player_id':provider_id,
              'minutes':int(obs['source_metrics'].get('minutes_played') or 0)})
            position=explicit_role(starter)
            if position is None:
                unknown[str(starter.get('positionStringShort') or
                  starter.get('localizedPosition') or starter.get('position') or
                  'NO_EXPLICIT_POSITION')]+=1
                continue
            mins=obs['source_metrics'].get('minutes_played')
            if not isinstance(mins,int) or mins<=0 or mins>130:
                continue
            out.append({
                'season':'2026-27','gameweek':8,'match_id':match_id,
                'player_id':int(obs['scout_player_id']),'team_id':int(obs['team_id']),
                'provider_player_id':provider_id,'started':True,'minutes':mins,
                'verified':True,'role':position['role'],'side':position['side'],
                'source_position_label':position['source_position_label'],
                'source_match_url':next(x['source_url'] for x in reports if int(x['fixture_id'])==match_id),
                'source_field':position['source_field']
            })
    if len({(r['gameweek'],r['player_id']) for r in out})!=len(out):
        raise ValueError('duplicate player tactical observations')
    return {
        'season':'2026-27','gameweek':8,'kind':'READ_ONLY_VERIFIED_TACTICAL_ROLE_EVIDENCE',
        'matched_played':286,'verified_fixtures':9,'verified_position_observations':len(out),
        'unknown_explicit_role_labels':dict(unknown),
        'source_layout_coverage':sum(isinstance(p['horizontal_x'],(int,float)) and isinstance(p['horizontal_y'],(int,float)) for p in placements),
        'raw_verified_starter_positions':placements,
        'created_at_utc':datetime.now(timezone.utc).isoformat(),
        'db_writes':0,'fantasy_points_written':0,'rows':out
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    def load(path):return json.loads(Path(path).read_text(encoding='utf-8'))
    report=collect(load(MANIFEST),load(ROSTER),load(OFFICIAL),load(REVIEWED),load(REVIEWED_PRIOR))
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('MH8 TACTICAL ROLE AUDIT: 9 verified fixtures / 286 matched players, '+
          str(report['verified_position_observations'])+' explicit starter roles; DB writes=0',
          flush=True)
    print('UNKNOWN POSITION LABELS '+json.dumps(report['unknown_explicit_role_labels'],
          ensure_ascii=False),flush=True)
    sample_ids={567,94,427,299,429,426,493,542}
    print('SOURCE LAYOUT COVERAGE '+str(report['source_layout_coverage'])+'/'+str(len(report['raw_verified_starter_positions'])),flush=True)
    print('POSITION SAMPLE '+json.dumps([p for p in report['raw_verified_starter_positions'] if p['player_id'] in sample_ids],ensure_ascii=False),flush=True)
    positions=Counter((p['provider_position_id'],p['horizontal_x'],p['horizontal_y'])
      for p in report['raw_verified_starter_positions'])
    print('SOURCE FORMATION SLOT DISTRIBUTION '+json.dumps([
      {'position_id':position_id,'x':x,'y':y,'count':count}
      for (position_id,x,y),count in positions.most_common(65)
    ],ensure_ascii=False),flush=True)
    counts=Counter((r['role'],r['side']) for r in report['rows'])
    print('ROLE COUNTS '+json.dumps({str(k):v for k,v in counts.items()},
          ensure_ascii=False),flush=True)

if __name__=='__main__':
    main()
