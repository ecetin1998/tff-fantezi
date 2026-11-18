import test from 'node:test'
import assert from 'node:assert/strict'
import {frozenMatchCalibration} from '../lib/frozenMatchCalibration.mjs'
const wk={gameweek:11,run_id:'frozen',status:'closed',prediction_mode:'live_frozen',snapshot_at:'2026-11-05T12:00:00Z'}
const actuals=[
 {gameweek:11,match_id:11,kickoff_at:'2026-11-06T17:00:00Z',match_status:'Bitti',fantasy_closure:'KAPANDI',home_goals:2,away_goals:1},
 {gameweek:11,match_id:12,kickoff_at:'2026-11-07T12:00:00Z',match_status:'Bitti',fantasy_closure:'KAPANDI',home_goals:0,away_goals:0},
 {gameweek:11,match_id:13,kickoff_at:'2026-11-07T15:00:00Z',match_status:'Bitti',fantasy_closure:'KAPANDI',home_goals:0,away_goals:2},
]
const prob=(id)=>({run_id:'frozen',match_id:id,home_win_probability:.4,draw_probability:.3,
 away_win_probability:.3,home_cs_probability:.3,away_cs_probability:.25,
 btts_probability:.5,over25_probability:.55})
test('uses actual 3+ goals, BTTS, both separate clean sheets and 1X2 only from frozen weeks',()=>{
 const r=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[prob(11),prob(12),prob(13)]})
 assert.equal(r.overall.matches,3)
 assert.equal(r.overall.over25.observed,.3333)
 assert.equal(r.overall.btts.observed,.3333)
 assert.equal(r.overall.home_cs.observed,.3333)
 assert.equal(r.overall.away_cs.observed,.6667)
 assert.equal(r.auto_promote,false)
 assert.equal(r.weeks[0].gameweek,11)
})
test('does not leak after kickoff, rolling forecasts, incomplete match or unpublished week',()=>{
 const after={...wk,snapshot_at:'2026-11-06T19:00:00Z'}
 assert.equal(frozenMatchCalibration({weeks:[after],actuals,forecasts:[prob(11)]}).overall.matches,0)
 assert.equal(frozenMatchCalibration({weeks:[{...wk,prediction_mode:'rolling'}],actuals,forecasts:[prob(11)]}).overall.matches,0)
 assert.equal(frozenMatchCalibration({weeks:[wk],actuals:[{...actuals[0],match_status:'Planlandı'}],forecasts:[prob(11)]}).overall.matches,0)
 assert.equal(frozenMatchCalibration({weeks:[{...wk,status:'pending'}],actuals,forecasts:[prob(11)]}).overall.matches,0)
})
test('dupes, invalid probs and incomplete outcome never count as good evidence',()=>{
 const duplicate=frozenMatchCalibration({weeks:[wk],actuals:[...actuals,actuals[0]],forecasts:[prob(11),prob(12)]})
 assert.equal(duplicate.overall.matches,1)
 assert.equal(duplicate.excluded_matches,1)
 const invalid=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[{...prob(11),over25_probability:1.6}, {...prob(12),home_win_probability:null}]})
 assert.equal(invalid.overall.matches,0)
 const dupPred=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[prob(11),prob(11)]})
 assert.equal(dupPred.overall.matches,0)
})
test('small sample never claims promotion even when predicted 3+ gap is large',()=>{
 const r=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[prob(11),prob(12),prob(13)]})
 assert.equal(r.over25_review,false)
 assert.equal(r.over25_gap,-.2167)
})
test('Wilson intervals expose sampling uncertainty without model promotion',()=>{
 const r=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[prob(11),prob(12),prob(13)]})
 const metric=r.overall.over25
 assert.equal(metric.observed_ci95.lower<metric.observed,true)
 assert.equal(metric.observed_ci95.upper>metric.observed,true)
 assert.equal(r.over25_outside_observed_ci95,false)
 const empty=frozenMatchCalibration()
 assert.equal(empty.overall.over25.observed_ci95,null)
 assert.equal(empty.over25_outside_observed_ci95,false)
})
test('a large observed vs predicted gap is diagnostic only',()=>{
 const forecasts=Array.from({length:45},(_,i)=>({...prob(i+100),over25_probability:.10}))
 const events=Array.from({length:45},(_,i)=>({
  gameweek:11,match_id:i+100,kickoff_at:'2026-11-06T17:00:00Z',
  match_status:'Bitti',fantasy_closure:'KAPANDI',
  home_goals:i<36?2:0,away_goals:i<36?1:0
 }))
 const r=frozenMatchCalibration({weeks:[wk],actuals:events,forecasts})
 assert.equal(r.overall.matches,45)
 assert.equal(r.over25_review,true)
 assert.equal(r.over25_outside_observed_ci95,true)
 assert.equal(r.auto_promote,false)
})

test('frozen scored goal rates include MAE and reference log-loss without replacing model coefficients',()=>{
 const forecasts=[
  {...prob(11),home_xg:1.5,away_xg:.7},
  {...prob(12),home_xg:1,away_xg:1},
  {...prob(13),home_xg:null,away_xg:5}
 ]
 const result=frozenMatchCalibration({weeks:[wk],actuals,forecasts})
 assert.equal(result.overall.matches,3)
 assert.equal(result.overall.goals.samples,2)
 assert.equal(result.overall.goals.home.predicted,1.25)
 assert.equal(result.overall.goals.home.observed,1)
 assert.equal(result.overall.goals.home.mae,.75)
 assert.equal(result.overall.goals.away.predicted,.85)
 assert.equal(result.overall.goals.away.observed,.5)
 assert.equal(result.overall.goals.away.mae,.65)
 assert.ok(result.overall.goals.poisson_reference_nll>=0)
 assert.equal(result.weeks[0].goals.samples,2)
 assert.equal(result.auto_promote,false)
})
test('negative / absent goal rates are excluded from goal error, not from valid probability calibration',()=>{
 const invalid=frozenMatchCalibration({weeks:[wk],actuals,forecasts:[
  {...prob(11),home_xg:-1,away_xg:.3},
  {...prob(12),home_xg:0,away_xg:12},
 ]})
 assert.equal(invalid.overall.matches,2)
 assert.equal(invalid.overall.goals.samples,0)
 assert.equal(invalid.overall.goals.home.mae,null)
 assert.equal(invalid.overall.goals.poisson_reference_nll,null)
})
test('goal rates never count for a week frozen after kickoff',()=>{
 const late=frozenMatchCalibration({weeks:[{...wk,snapshot_at:'2026-11-07T16:00:00Z'}],
  forecasts:[{...prob(13),home_xg:1.3,away_xg:1}],actuals:[actuals[2]]})
 assert.equal(late.overall.matches,0)
 assert.equal(late.overall.goals.samples,0)
})
