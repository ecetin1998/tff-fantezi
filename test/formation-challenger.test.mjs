import test from 'node:test'
import assert from 'node:assert/strict'
import {compareFrozenLineupCandidates as compare} from '../supabase/functions/weekly-model-lifecycle/formationChallenger.mjs'
const f={gameweek:10,match_id:100,home_team_id:1,away_team_id:2,kickoff_at:'2026-10-25T10:00:00Z'}
const w={gameweek:10,status:'closed',champion_snapshot_at:'2026-10-24T10:00:00Z',
 challenger_input_cutoff_at:'2026-10-24T09:00:00Z',challenger_training_through:9}
const ids=Array.from({length:13},(_,i)=>i+1)
const base=ids.map(id=>({gameweek:10,player_id:id,club_id:1,xi_probability:id<=11?.3:.8,
 x_minutes:id<=11?25:70,xfp:3}))
const trial=ids.map(id=>({...base[id-1],xi_probability:id<=11?.8:.1,
 x_minutes:id<=11?83:6,xfp:3.5}))
const xi=ids.slice(0,11).map(id=>({gameweek:10,match_id:100,team_id:1,player_id:id,
 started:true,verified_first_11:true,source_url:'https://tff.example/fixture'}))
const results=ids.map(id=>({gameweek:10,player_id:id,is_final:true,
 minutes:id<=11?85:0,points:id<=11?4:0,source_kind:'fresh_closed_actual'}))
const input=()=>({weeks:[w],fixtures:[f],champion:base,challenger:trial,verifiedXi:xi,actuals:results})
test('compares true starters and source-backed nonstarters without promoting itself',()=>{
 const q=compare(input()),s=q.per_week[0]
 assert.equal(s.xi_sample,13);assert.equal(s.verified_starters,11)
 assert.ok(s.xi_brier_gain>0);assert.ok(s.minute_mae_gain>0);assert.ok(s.xfp_mae_gain>0)
 assert.equal(q.auto_promote,false)
 assert.equal(q.ready_for_review,false,'one small week never authorizes release')
})
test('excludes inferred 0/0 from minute and point training cohorts',()=>{
 const d=input();d.actuals=d.actuals.map((r,i)=>i===11?{...r,source_kind:'independently_calculated_source_events'}:r)
 const q=compare(d),s=q.per_week[0]
 assert.equal(s.unverified_zero_excluded,1)
 assert.equal(s.minute_sample,12)
})
test('rejects post-kickoff candidate source, open weeks and future training',()=>{
 for(const x of [
  {...w,challenger_input_cutoff_at:'2026-10-26T00:00:00Z'},
  {...w,status:'open'},
  {...w,challenger_training_through:10}
 ]){
  const d=input();d.weeks=[x];const q=compare(d)
  assert.equal(q.compared_weeks,0);assert.equal(q.ready_for_review,false)
  assert.deepEqual(q.blocked_weeks,[10])
 }
})
test('no partial ten-player lineup or contradictory duplicates enter scoring',()=>{
 const d=input();d.verifiedXi=d.verifiedXi.slice(0,10)
 assert.equal(compare(d).per_week[0].incomplete_or_contradictory_lineups,1)
 const e=input();e.verifiedXi.push({...e.verifiedXi[0]})
 assert.equal(compare(e).per_week[0].incomplete_or_contradictory_lineups,1)
})
