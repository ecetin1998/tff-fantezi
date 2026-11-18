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
 assert.equal(r.overall.over25.observed,1/3)
 assert.equal(r.overall.btts.observed,1/3)
 assert.equal(r.overall.home_cs.observed,2/3)
 assert.equal(r.overall.away_cs.observed,1/3)
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
