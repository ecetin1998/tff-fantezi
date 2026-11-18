import test from 'node:test'
import assert from 'node:assert/strict'
import {validRegisteredFormation,selectVerifiedFormation} from '../supabase/functions/run-live-sim-chunk/formationScenario.mjs'
const base={GK:1,DEF:4,MID:5,FWD:1},latest={GK:1,DEF:4,MID:6,FWD:0}
const options=[{formation:latest,weight:.6,evidence_week:11},
  {formation:base,weight:.4,evidence_week:10}]
const eligible={GK:2,DEF:8,MID:10,FWD:3}
test('validate exactly 11 registered players and allow zero-forwards',()=>{
 assert.equal(validRegisteredFormation(latest,eligible),true)
 assert.equal(validRegisteredFormation({...latest,MID:5},eligible),false)
 assert.equal(validRegisteredFormation({...latest,GK:2,MID:5},eligible),false)
})
test('fixed random numbers reproduce source-backed alternative lineup draws',()=>{
 assert.deepEqual(selectVerifiedFormation(base,options,()=>.2,eligible),latest)
 assert.deepEqual(selectVerifiedFormation(base,options,()=>.85,eligible),base)
})
test('one-XI, duplicated week, non-positive weight and invalid quota fail closed',()=>{
 for(const bad of [null,[options[0]],[{...options[0],evidence_week:10},options[1]],
  [{...options[0],weight:-1},options[1]],
  [{...options[0],formation:{GK:1,DEF:4,MID:5,FWD:2}},options[1]]]){
  assert.deepEqual(selectVerifiedFormation(base,bad,()=>.01,eligible),base)
 }
})
test('insufficient eligible registered players force prior safe quota',()=>{
 assert.deepEqual(selectVerifiedFormation(base,options,()=>.01,{...eligible,MID:5}),base)
})
