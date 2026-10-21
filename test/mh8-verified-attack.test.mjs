import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {blendVerifiedAttackRate} from '../supabase/functions/weekly-model-lifecycle/mh8Attack.mjs'

test('missing MH8 advanced stats are unknown, not a scored zero',()=>{
  assert.deepEqual(blendVerifiedAttackRate(.25,null,90,'xg'),{rate:.25,applied:false})
  assert.deepEqual(blendVerifiedAttackRate(.1,undefined,90,'xa'),{rate:.1,applied:false})
  assert.deepEqual(blendVerifiedAttackRate(.25,.5,null,'xg'),{rate:.25,applied:false})
  assert.deepEqual(blendVerifiedAttackRate(.25,.5,0,'xg'),{rate:.25,applied:false})
})
test('sourced zero means an actual observed zero and receives bounded shrinkage',()=>{
  const result=blendVerifiedAttackRate(.20,0,90,'xg')
  assert.equal(result.applied,true)
  assert.ok(result.rate<.20&&result.rate>=.16)
})
test('single match xG/xA cannot overwhelm season prior',()=>{
  const xg=blendVerifiedAttackRate(.3,2,90,'xg'),xa=blendVerifiedAttackRate(.2,1,90,'xa')
  assert.ok(xg.rate>.3&&xg.rate<=.36+1e-9)
  assert.ok(xa.rate>.2&&xa.rate<=.24+1e-9)
  assert.equal(blendVerifiedAttackRate(.3,-2,90,'xg').applied,false)
  assert.equal(blendVerifiedAttackRate(.3,9,90,'xg').applied,false)
  assert.equal(blendVerifiedAttackRate(.3,2,90,'points').applied,false)
})
test('MH9 candidate uses unchanged baseline (no double application of MH8 evidence)',()=>{
  const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(worker,/blendVerifiedAttackRate\(n\(stableRates\[0\]/)
  assert.match(worker,/attackEvidence\.get\(Number\(x\.player_id\)\)/)
  assert.match(worker,/mh8-attack-source-v1/)
})
test('verified evidence importer only accepts the exact fixture/participant identity and nullable metrics',()=>{
  const importWorker=readFileSync(new URL('../supabase/functions/ingest-scout-enrichment/index.ts',import.meta.url),'utf8')
  const code=importWorker.slice(importWorker.indexOf('if(body.mode==="verified_gw8_attack")'),importWorker.indexOf('if(body.mode==="weekly_delta")'))
  assert.match(code,/body\.matched_played!==286/)
  assert.match(code,/Number\(part\.match_id\)!==matchId/)
  assert.match(code,/observation\[key\]=null/)
  assert.match(code,/IMMUTABLE_MH8_SOURCE_CONFLICT/)
  assert.doesNotMatch(code,/scout_player_season_stats.*upsert/)
  assert.doesNotMatch(code,/scout_player_weekly_points.*update/)
})
