#!/usr/bin/env python3
"""Read-only GW7 full-time tactical lineup geometry with official fixture crosswalk.
Only exact current-team roster/provider matches are used for player IDs.
No automatic Fantasy position changes, no persisted role guesses.
"""
import json
from pathlib import Path
from collections import Counter,defaultdict
from datetime import datetime,timezone
import argparse
from extract_mh8_fotmob_advanced import read_verified_fixture
from reconcile_mh8_provider_players import ROSTER,choose_player

STARTERS=Path('data/source-evidence/gw7-fotmob-starting-xi-2026-10-12.json')
# Closed fixture ids, registered teams, and full-time scores confirmed
# against scout_match_history for GW7 (2026-27).
FIXTURES={
 317838:(18,8,'Gaziantep','Çorum FK',0,3),
 317839:(16,10,'Eyüpspor','Göztepe',0,4),
 317840:(14,2,'Alanyaspor','Erzurumspor',0,0),
 317841:(12,6,'Rizespor','Fenerbahçe',0,3),
 317842:(11,5,'Gençlerbirliği','Amed',2,2),
 317843:(7,13,'Konyaspor','Başakşehir',0,0),
 317844:(17,3,'Galatasaray','Kasımpaşa',3,1),
 317845:(9,4,'Beşiktaş','Kocaelispor',2,1),
 317846:(15,1,'Samsunspor','Trabzonspor',0,3)
}
def audit(source,roster,reader=read_verified_fixture):
    by_team=defaultdict(list)
    for x in roster.get('players',[]):by_team[int(x['team_id'])].append(x)
    if source.get('gameweek')!=7 or len(source.get('matches',[]))!=9:
        raise ValueError('need 9 previously verified GW7 XI sources')
    observations,errors=[],{}
    for match in source['matches']:
        mid=int(match['match_id'])
        if mid not in FIXTURES:raise ValueError('unverified match_id')
        home,away,hname,aname,hgoals,agoals=FIXTURES[mid]
        record=dict(match,
            home_team=hname,away_team=aname,
            home_goals=hgoals,away_goals=agoals,
            candidate_fotmob_url=match['source_url'])
        try:
            report,details=reader(record)
        except Exception as exc:
            errors[str(mid)]=type(exc).__name__+': '+str(exc)[:125]
            continue
        if report.get('status')!='STRUCTURED_FIXTURE_CONFIRMED' or not report['data']['lineup_complete']:
            errors[str(mid)]='lineup unverified'
            continue
        lineup=details.get('content',{}).get('lineup') or {}
        for side,team_id in (('homeTeam',home),('awayTeam',away)):
            team=lineup.get(side) or {}
            for starter in team.get('starters') or []:
                if not isinstance(starter,dict):continue
                player,basis=choose_player({
                    'player_name':starter.get('name'),
                    'shirt_number':starter.get('shirtNumber')
                },by_team[team_id])
                if player is None:continue
                layout=starter.get('horizontalLayout') or {}
                if not isinstance(layout,dict):continue
                x,y=layout.get('x'),layout.get('y')
                if not isinstance(x,(int,float)) or not isinstance(y,(int,float)):continue
                if not (0<=x<=1 and 0<=y<=1):continue
                observations.append({
                  'player_id':int(player['id']),'gameweek':7,
                  'match_id':mid,'team_id':team_id,'started':True,'verified':True,
                  'provider_player_id':starter.get('id'),
                  'position_id':starter.get('positionId'),
                  'x':x,'y':y,'formation':team.get('formation'),
                  'source_url':match['source_url'],'mapping_method':basis
                })
    if len({(x['player_id'],x['gameweek']) for x in observations})!=len(observations):
        raise ValueError('duplicate player ids in verified GW7')
    return {
      'kind':'READ_ONLY_VERIFIED_MH7_LINEUP_COORDINATES',
      'gameweek':7,'expected_fixtures':9,'verified_fixtures':9-len(errors),
      'player_coordinates':len(observations),'unresolved_fixtures':errors,
      'db_writes':0,'fantasy_points_written':0,
      'updated_at_utc':datetime.now(timezone.utc).isoformat(),
      'rows':observations
    }
if __name__=='__main__':
  arg=argparse.ArgumentParser()
  arg.add_argument('--output',type=Path,required=True)
  args=arg.parse_args()
  src=json.loads(STARTERS.read_text(encoding='utf-8'))
  roster=json.loads(Path(ROSTER).read_text(encoding='utf-8'))
  report=audit(src,roster)
  args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
  print('GW7 LINEUP GEOMETRY '+str(report['verified_fixtures'])+'/9 sources '+str(report['player_coordinates'])+' mapped XI',flush=True)
  print('UNRESOLVED '+json.dumps(report['unresolved_fixtures'],ensure_ascii=False),flush=True)
  ids={567,94,427,299,429,426,493,542}
  print('GW7 POSITION SAMPLE '+json.dumps([p for p in report['rows'] if p['player_id'] in ids],ensure_ascii=False),flush=True)
