import test from 'node:test'
import assert from 'node:assert/strict'
import {sustainedStarterContinuity} from '../supabase/functions/weekly-model-lifecycle/sustainedStarterContinuity.mjs'

const cutoff='2026-11-06T17:00:00Z'
const weekly=[
 {gameweek:9,minutes:87,is_final:true,source_kind:'independently_calculated_source_events',
  source_updated_at:'2026-10-26T22:22:10Z',created_at:'2026-10-26T22:15:07Z'},
 {gameweek:10,minutes:83,is_final:true,source_kind:'mh10_owner_approved_independent_score_events',
  source_updated_at:'2026-11-02T22:01:12Z',created_at:'2026-11-02T22:01:12Z'}
]
const base=()=>({baseline:.44,position:'MID',weekly,targetWeek:11,cutoffAt:cutoff,availability:1})
test('two sourced consecutive final 60+ weeks lift only bounded XI-selection role',()=>{
 const r=sustainedStarterContinuity(base())
 assert.equal(r.applied,true)
 assert.deepEqual(r.evidence_weeks,[9,10])
 assert.equal(Math.round(r.delta*1e6),84000)
 assert.equal(r.role,.524)
})
test('source imported or verified after kickoff never changes prediction',()=>{
 const a=sustainedStarterContinuity({...base(),weekly:[
   weekly[0],{...weekly[1],created_at:'2026-11-06T18:00:00Z'}]})
 const b=sustainedStarterContinuity({...base(),weekly:[
   weekly[0],{...weekly[1],source_updated_at:'2026-11-06T18:00:00Z'}]})
 assert.equal(a.applied,false)
 assert.equal(b.applied,false)
})
test('do not convert one-week surge, sub cameo, zero or reconstructed 0 into starter certainty',()=>{
 for(const candidate of [
   [weekly[0]],
   [weekly[0],{...weekly[1],minutes:29}],
   [weekly[0],{...weekly[1],minutes:0}],
   [weekly[0],{...weekly[1],is_final:false}],
   [weekly[0],{...weekly[1],source_kind:'reconstructed_from_fixtures'}],
   [weekly[0],weekly[1],weekly[1]]
 ]){
   assert.equal(sustainedStarterContinuity({...base(),weekly:candidate}).applied,false)
 }
})
test('availability, GK, high role and repeated refresh guards are fail-closed',()=>{
 assert.equal(sustainedStarterContinuity({...base(),availability:.79}).applied,false)
 assert.equal(sustainedStarterContinuity({...base(),position:'GK'}).applied,false)
 assert.equal(sustainedStarterContinuity({...base(),baseline:.69}).applied,false)
 assert.equal(sustainedStarterContinuity({...base(),alreadyApplied:true}).applied,false)
 assert.equal(sustainedStarterContinuity({...base(),targetWeek:12}).applied,false)
})
