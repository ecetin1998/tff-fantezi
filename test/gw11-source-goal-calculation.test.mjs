import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const audit=JSON.parse(readFileSync('data/source-evidence/gw11-verified-match-result-goals-2026-11-08.json','utf8'));
const rules=JSON.parse(readFileSync('rules/tff-fantasy.json','utf8'));

test('MH11 fixture identity map is complete and does not mistake internal IDs for TFF IDs',()=>{
  assert.equal(audit.gameweek,11);
  assert.equal(audit.season,'2026-27');
  assert.equal(audit.fixtures.length,9);
  assert.equal(new Set(audit.fixtures.map(m=>m.match_id)).size,9);
  assert.equal(new Set(audit.fixtures.map(m=>m.tff_match_id)).size,9);
  assert.equal(audit.fixtures.filter(m=>m.match_id!==m.tff_match_id).length,7);
  for(const m of audit.fixtures){
    assert.equal(typeof m.source,'string');
    assert.ok(m.source.startsWith('https://'));
    assert.notEqual(m.home_id,m.away_id);
  }
});
test('all nine observed match scores reconcile with player goal and own-goal identities',()=>{
  let regular=0,own=0,goalComponent=0,events=0;
  const ids=new Set();
  for(const m of audit.fixtures){
    let home=0,away=0;
    for(const e of m.events){
      assert.ok([m.home_id,m.away_id].includes(e.team_id),'Goal event on wrong club');
      assert.ok(Number.isInteger(e.player_id));
      assert.ok(Number.isInteger(e.normal_goals)&&e.normal_goals>=0);
      assert.ok(Number.isInteger(e.own_goals)&&e.own_goals>=0);
      assert.ok(e.normal_goals+e.own_goals>=1);
      assert.ok(!ids.has(e.player_id),'A player should be in at most one MH11 match');
      ids.add(e.player_id);
      if(e.team_id===m.home_id){
        home+=e.normal_goals;away+=e.own_goals;
      }else{
        away+=e.normal_goals;home+=e.own_goals;
      }
      regular+=e.normal_goals;own+=e.own_goals;events++;
      const expected=e.normal_goals*rules.scoring.goal[e.position]+
                     e.own_goals*rules.scoring.own_goal;
      assert.equal(e.goal_component_points,expected,'Incorrect role-based fantasy goal component');
      goalComponent+=expected;
    }
    assert.equal(home,m.home_goals,'Home score mismatch for '+m.match_id);
    assert.equal(away,m.away_goals,'Away score mismatch for '+m.match_id);
  }
  assert.equal(events,24);
  assert.equal(regular,27);
  assert.equal(own,1);
  assert.equal(goalComponent,125);
  assert.deepEqual(audit.summaries,{
    matches:9,normal_goals:27,own_goals:1,total_football_goals:28,
    goal_component_fantasy_points:125,partial_player_evidence_rows:24
  });
});
test('partial goal evidence cannot silently finalize the 456-player week',()=>{
  assert.equal(audit.status.fantasy_week_closed,false);
  assert.equal(audit.status.official_fantasy_points_available,false);
  assert.equal(audit.status.complete_player_actuals,0);
  assert.equal(audit.status.required_player_actuals,456);
  assert.equal(audit.missing_to_close.length>=6,true);
  assert.equal(audit.fixtures.some(m=>m.events.some(e=>
    e.minutes!==undefined||e.saves!==undefined||e.assists!==undefined
  )),false,'Unknown fantasy events are not zero-filled');
});
