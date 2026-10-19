const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const data=JSON.parse(fs.readFileSync('data/source-evidence/gw8-goal-penalty-event-staging-2026-10-20.json','utf8'));
const scores=JSON.parse(fs.readFileSync('data/source-evidence/gw8-tff-verified-match-results-2026-10-20.json','utf8'));
const scoreMap=new Map(scores.matches.map(m=>[m.match_id,m]));
const count=(pred,arr)=>arr.filter(pred).length;
test('MH8 staged goal events match all nine TFF fulltime scorelines',()=>{
 assert.equal(data.gameweek,8);
 assert.equal(data.matches.length,9);
 assert.equal(new Set(data.matches.map(m=>m.match_id)).size,9);
 let goals=0;
 for(const m of data.matches){
  const result=scoreMap.get(m.match_id);
  assert(result,'missing canonical match '+m.match_id);
  assert(m.sources.length>=1 && m.sources.every(url=>/^https:\/\//.test(url)),'source URL required');
  assert.equal(m.home_goals,result.home_goals);
  assert.equal(m.away_goals,result.away_goals);
  assert.equal(count(g=>g.side==='home',m.goals),result.home_goals,'home scorer slots '+m.match_id);
  assert.equal(count(g=>g.side==='away',m.goals),result.away_goals,'away scorer slots '+m.match_id);
  for(const goal of m.goals){
   if(goal.kind==='disputed_goal_attribution'){
    assert.equal(goal.scorer_id,null,'a disputed scorer MUST stay unassigned');
    assert(goal.candidates.length>=2,'conflicting candidates must be attached');
    assert.equal(goal.resolution,'PENDING_OFFICIAL_MATCH_REPORT');
   }else{
    assert(Number.isInteger(goal.scorer_id)&&goal.scorer_id>0,'mapped player id required for sourced goal');
   }
   if(goal.kind==='own_goal')assert(goal.scorer_team_id!==undefined,
     'own-goal player must be attached to conceding club, not awarded scorer goal points');
   if(goal.assist_candidate_id!==undefined&&goal.assist_candidate_id!==null)
    assert(Number.isInteger(goal.assist_candidate_id));
  }
  goals+=m.goals.length;
 }
 assert.equal(goals,23);
});
test('Do not mistake score evidence for all Fantasy component evidence',()=>{
 const all=data.matches.flatMap(m=>m.goals);
 assert.equal(count(g=>g.kind==='disputed_goal_attribution',all),1);
 assert.equal(count(g=>g.kind==='own_goal',all),1);
 const penalty=data.matches.flatMap(m=>m.special_events||[]);
 assert.equal(penalty.length,1);
 assert.equal(penalty[0].type,'saved_penalty');
 assert.equal(penalty[0].taker_player_id,176,'Mason Greenwood penalty miss');
 assert.equal(penalty[0].keeper_player_id,419,'Paulo Victor saved penalty');
 assert.equal(penalty[0].status,'two_source_verified');
 assert.notEqual(penalty[0].taker_player_id,penalty[0].keeper_player_id);
 assert.equal(data.controls.complete_player_minutes,false);
 assert.equal(data.controls.complete_keeper_saves,false);
 assert.equal(data.controls.complete_yellow_red_cards,false);
 assert.equal(data.controls.complete_assist_attribution,false);
 assert.equal(data.controls.ready_to_finalize_fantasy,false);
 assert.equal(data.matches.some(m=>m.goals.some(g=>g.kind==='disputed_goal_attribution'&&g.scorer_id!==null)),false);
});
