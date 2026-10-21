#!/usr/bin/env python3
"""Compare all MH7–MH8 verified FotMob lineup geometry across actual matches.

READ ONLY. Geometry is an inferred tactical position, not an explicit provider
string or the player's official Fantasy registration. Only high-confidence
flank/defence placements can become a candidate after TWO matching matches.
"""
from __future__ import annotations
import json
import argparse
from pathlib import Path
from collections import Counter
from audit_gw7_tactical_layout import audit as audit_gw7,STARTERS,ROSTER
from audit_mh8_tactical_roles import collect as audit_gw8
from probe_mh8_fotmob_structured import MANIFEST
from reconcile_mh8_provider_players import OFFICIAL,REVIEWED,REVIEWED_PRIOR

def safe_role(row):
    x=row.get('x',row.get('horizontal_x'))
    y=row.get('y',row.get('horizontal_y'))
    f=row.get('formation')
    if not isinstance(x,(int,float)) or not isinstance(y,(int,float)) or not 0<=x<=1 or not 0<=y<=1:
        return None
    if not isinstance(f,str) or '-' not in f:
        return None
    try:backs=int(f.split('-')[0])
    except ValueError:return None
    side='R' if y>=.75 else 'L' if y<=.25 else None
    # Repeated front-wide starts (e.g. FotMob 82 at x=.678,y=.875):
    # high-confidence right/left winger despite a registered DEF card.
    if side and x>=.66:
        return 'W',side,'advanced_flank_layout'
    # Full backs in the defensive starting line, verified by formation.
    if side and .23<=x<=.415 and backs in (4,5):
        return 'FB',side,'back_line_flank_layout'
    # Wingbacks in 3-CB formations, not categorically all wide midfielders.
    if side and .435<=x<.66 and backs in (3,5):
        return 'WB',side,'wingback_layout'
    # Back-three central defenders. Avoid pretending to know DM/CM/AM
    # from x alone; these are NOT automatically relabeled.
    if .24<=x<=.415 and backs in (3,4,5) and .26<y<.74:
        return 'CB','C','centre_back_layout'
    return None

def compare(seven,eight,registry):
    by7={int(o['player_id']):o for o in seven['rows'] if safe_role(o)}
    by8={int(o['player_id']):o for o in eight['raw_verified_starter_positions']
        if safe_role(o) and o.get('minutes',0)>=45}
    players={int(r['id']):r for r in registry['players']}
    comparable,changed=[],[]
    for pid,o7 in by7.items():
        o8=by8.get(pid)
        if not o8 or int(o7.get('team_id') or 0)!=int(o8.get('team_id') or 0):
            continue
        r7=safe_role(o7);r8=safe_role(o8)
        if r7[:2]!=r8[:2]:continue
        player=players.get(pid)
        if not player:continue
        info={
          'player_id':pid,'name':player['full_name'],
          'fantasy_position':player['position'],
          'model_role_candidate':r8[0],'side':r8[1],
          'gw7_match_id':o7['match_id'],'gw8_match_id':o8['match_id'],
          'gw7_position_id':o7.get('position_id'),
          'gw8_position_id':o8.get('provider_position_id'),
          'gw7_geometry':[o7['x'],o7['y']],
          'gw8_geometry':[o8['horizontal_x'],o8['horizontal_y']],
          'gw7_formation':o7['formation'],'gw8_formation':o8['formation'],
          'source_role_confidence':'two_independent_verified_formation_geometries',
          'source_type':'inferred_tactical_role_not_official_position',
          'gw7_source_url':o7['source_url'],
          'gw8_provider_player_id':o8['provider_player_id'],
          'gw8_minutes':o8['minutes'],
        }
        comparable.append(info)
        # Input checked-in roster does not include primary_role; compare
        # explicit live primary role on a separate authoritative DB join.
    return {
      'gameweeks':[7,8],'kind':'SHADOW_GW7_GW8_TACTICAL_GEOMETRY_COMPARISON',
      'gw7_verified_fixtures':seven['verified_fixtures'],
      'gw8_verified_fixtures':eight['verified_fixtures'],
      'gw7_coordinate_rows':seven['player_coordinates'],
      'gw8_coordinate_rows':len(eight['raw_verified_starter_positions']),
      'two_week_supported_roles':len(comparable),
      'by_role':dict(Counter(i['model_role_candidate'] for i in comparable)),
      'paired_candidates':comparable,'db_writes':0,'fantasy_points_written':0,
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    load=lambda path:json.loads(Path(path).read_text(encoding='utf8'))
    registry=load(ROSTER)
    seven=audit_gw7(load(STARTERS),registry)
    eight=audit_gw8(load(MANIFEST),registry,load(OFFICIAL),load(REVIEWED),load(REVIEWED_PRIOR))
    output=compare(seven,eight,registry)
    a.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('PAIRED VERIFIED ROLES '+str(output['two_week_supported_roles'])+
      ', GW7 '+str(output['gw7_verified_fixtures'])+'/9, GW8 '+
      str(output['gw8_verified_fixtures'])+'/9; writes=0',flush=True)
    print('BY TACTICAL ROLE '+json.dumps(output['by_role']),flush=True)
    highlight={567,427,429,299,94,426,493,542}
    print('KEY PLAYERS '+json.dumps([x for x in output['paired_candidates']
      if x['player_id'] in highlight],ensure_ascii=False),flush=True)
    print('ALL ROLE CANDIDATE IDS '+json.dumps([x['player_id'] for x in output['paired_candidates']]),flush=True)

if __name__=='__main__':main()
