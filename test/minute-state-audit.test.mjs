import test from 'node:test';
import assert from 'node:assert/strict';
import {minuteStateAudit} from '../supabase/functions/weekly-model-lifecycle/minuteStateAudit.mjs';
const fixture={gameweek:11,match_id:42,home_team_id:1,away_team_id:2,kickoff_at:'2026-11-06T17:00:00Z'};
const week={gameweek:11,run_id:'frozen',status:'closed',prediction_mode:'live_frozen',
 snapshot_at:'2026-11-02T22:30:00Z',training_through_gameweek:10};
const players=Array.from({length:13},(_,i)=>({id:i+1,team_id:1,position:i===0?'GK':i<5?'DEF':i<10?'MID':'FWD'}));
const projections=players.map(p=>({run_id:'frozen',player_id:p.id,
 xi_probability:p.id<=11?.82:.08,appearance_probability:p.id<=11?.94:.42,x_minutes:p.id<=11?77:18}));
const evidence=players.slice(0,12).map(p=>({gameweek:11,match_id:42,player_id:p.id,
 started:p.id<=11,verified_first_11:p.id<=11,verified_substitution:p.id===12,
 minutes:p.id<=11?85:15,source_url:'https://www.tff.org/match',updated_at:'2026-11-07T21:00:00Z'}));
const actuals=players.map(p=>({gameweek:11,player_id:p.id,is_final:true,
 minutes:p.id<=11?85:p.id===12?15:0,points:p.id<=11?3:1,
 source_kind:'mh11_owner_approved_independent_score_events'}));
const x=()=>({weeks:[week],fixtures:[fixture],players,projections,evidence,actuals});
test('complete XI measures starters and independently verified sub but not zero/DNP',()=>{
 const r=minuteStateAudit(x());
 assert.deepEqual(r.eligible_weeks,[11]);
 assert.equal(r.overall.xi_n,13);
 assert.equal(r.overall.confirmed_starters,11);
 assert.equal(r.overall.confirmed_substitutes,1);
 assert.equal(r.overall.confirmed_unused,0);
 assert.equal(r.overall.unknown_unused_excluded,1);
 assert.equal(r.overall.ex_ante_30_minute_sample,11);
 assert.equal(r.overall.verified_active_n,12);
 assert.equal(r.overall.actual_60_plus,11);
 assert.equal(r.overall.missed_60_plus_forecast_under_30,0);
 assert.equal(r.overall.incomplete_or_contradictory_xi,0);
 assert.equal(r.no_writes,true);
 assert.equal(r.auto_promote,false);
});
test('partial 10-player XI and post-freeze source policy cannot enter metrics',()=>{
 const partial=x();partial.evidence=partial.evidence.filter(e=>e.player_id!==5);
 assert.equal(minuteStateAudit(partial).overall.xi_n,0);
 const invalid=x();invalid.weeks=[{...week,training_through_gameweek:11}];
 assert.deepEqual(minuteStateAudit(invalid).eligible_weeks,[]);
 const unfrozen=x();unfrozen.weeks=[{...week,snapshot_at:'2026-11-07T00:00:00Z'}];
 assert.deepEqual(minuteStateAudit(unfrozen).eligible_weeks,[]);
});
test('verified bench record needs matching final source minutes, no invented state',()=>{
 const bad=x();bad.actuals[11].minutes=22;
 const r=minuteStateAudit(bad);
 assert.equal(r.overall.confirmed_substitutes,0);
 assert.equal(r.overall.unmatched_played_evidence,1);
});
test('future-week forecasts, missing probabilities and inferred DNP are not used',()=>{
 const bad=x();bad.projections[0].run_id='future-run';
 const a=minuteStateAudit(bad);
 assert.equal(a.overall.missing_frozen_predictions,1);
 assert.equal(a.overall.xi_n,12);
 const invalid=x();invalid.projections[1].appearance_probability=.2;
 assert.equal(minuteStateAudit(invalid).overall.invalid_frozen_predictions,1);
});

test('independent full match absence plus final owner-approved zero forms third state',()=>{
 const d=x();
 d.evidence.push({gameweek:11,match_id:42,player_id:13,started:false,
  verified_first_11:false,verified_substitution:false,minutes:0,
  evidence_note:'Player not named in full match participation list: sourced full-match absence',
  source_url:'https://www.tff.org/match',updated_at:'2026-11-07T21:00:00Z'});
 const r=minuteStateAudit(d);
 assert.equal(r.overall.confirmed_unused,1);
 assert.equal(r.overall.unknown_unused_excluded,0);
 assert.equal(r.overall.full_three_state_scope,true);
 assert.ok(r.overall.complete_state_brier>0);
 assert.equal(r.overall.known_playing_state_n,13);
});
test('unsourced or inferred zero never becomes verified unused',()=>{
 for(const change of [
  {evidence_note:'unconfirmed zero'}, {source_url:null},
  {updated_at:'2026-11-01T00:00:00Z'}, {verified_substitution:true},
 ]){
  const d=x();
  d.evidence.push({...{
   gameweek:11,match_id:42,player_id:13,started:false,
   verified_first_11:false,verified_substitution:false,minutes:0,
   evidence_note:'Player not named in full match participation list: sourced full-match absence',
   source_url:'https://www.tff.org/match',updated_at:'2026-11-07T21:00:00Z'
  },...change});
  const r=minuteStateAudit(d);
  assert.equal(r.overall.confirmed_unused,0);
  assert.equal(r.overall.full_three_state_scope,false);
 }
 const d=x();
 d.evidence.push({gameweek:11,match_id:42,player_id:13,started:false,verified_first_11:false,
   verified_substitution:false,minutes:0,
   evidence_note:'Player not named in full match participation list: sourced full-match absence',
   source_url:'https://www.tff.org/match',updated_at:'2026-11-07T21:00:00Z'});
 d.actuals[12].source_kind='inferred_score_from_events';
 assert.equal(minuteStateAudit(d).overall.confirmed_unused,0);
});
