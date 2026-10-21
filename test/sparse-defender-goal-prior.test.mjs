import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sparseChanceDefenderRates as calibrate} from '../supabase/functions/weekly-model-lifecycle/sparseChanceDefender.mjs'

const sample=(xgPer90,goalsPer90,seasonMinutes,shots,advancedThroughGameweek=7,role='CB')=>
  calibrate({position:'DEF',role,xgPer90,goalsPer90,seasonMinutes,
    shots,advancedThroughGameweek,throughGameweek:8})

test('MH8 Fatih Aksoy one-off xG is reduced without rewriting observed history',()=>{
  const x=sample(.64*90/433,0,433,1)
  assert.ok(x.applied)
  assert.equal(x.shotEvidenceTrusted,false,'GW7 shot counts must not be matched with GW8 xG')
  assert.ok(x.xgPer90>.04&&x.xgPer90<.09,JSON.stringify(x))
  assert.equal(x.goalsPer90,0)
})
test('Zak Jules one unusual chance and one goal are not treated as an every-week scorer',()=>{
  const x=sample(1.07*90/720,1*90/720,720,4)
  assert.ok(x.xgPer90>.04&&x.xgPer90<.10)
  assert.ok(x.goalsPer90<.09)
  assert.equal(x.shotEvidenceTrusted,false)
})
test('repeated verified shots improve evidence, not raw high-quality one-off outliers',()=>{
  const sparse=sample(.15,0,720,1,8)
  const regular=sample(.15,0,720,8,8)
  assert.equal(sparse.shotEvidenceTrusted,true)
  assert.equal(regular.shotEvidenceTrusted,true)
  assert.ok(sparse.xgPer90<regular.xgPer90)
  assert.ok(sparse.xgPer90<.07)
})
test('corrupted shot counts and missing/stale source never become trusted frequency',()=>{
  for(const shots of [null,-1,58,1.5]){
    const x=sample(.134,.125,720,shots,8)
    assert.equal(x.shotEvidenceTrusted,false)
    assert.ok(x.xgPer90<.10)
  }
})
test('fullbacks, wingbacks and forwards use role-sensitive adjustments',()=>{
  const cb=sample(.14,0,720,2,8,'CB')
  const wingback=sample(.14,0,720,2,8,'WB')
  assert.ok(wingback.xgPer90>cb.xgPer90)
  assert.equal(wingback.applied,false,'wingbacks keep their original role risk/reward')
  const fullback=sample(.14,0,720,2,8,'FB')
  assert.equal(fullback.applied,false,'attacking fullbacks must not be globally penalized')
  assert.equal(fullback.xgPer90,.14)
  const striker=calibrate({position:'FWD',role:'ST',xgPer90:.4,goalsPer90:.25,seasonMinutes:600})
  assert.equal(striker.applied,false)
  assert.equal(striker.xgPer90,.4)
})
test('does not mistake missing observations for zero or overwrite the parent model',()=>{
  for(const value of [null,undefined,NaN,-2]){
    const x=sample(.2,0,value,1)
    assert.equal(x.applied,false)
    assert.equal(x.xgPer90,.2)
  }
  const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(worker,/sparseChanceDefenderRates\(/)
  assert.match(worker,/sparse-defender-xg-v1/)
  assert.match(worker,/stableInput\.source_note/)
  assert.match(worker,/sourceStatsQ/)
  assert.match(worker,/sourceStatsMap/)
  assert.match(worker,/sourceStatsMap\.get/)
  assert.match(worker,/sourceNote|source_note/)
  assert.match(worker,/source_note,rates/)
  assert.doesNotMatch(worker,/scout_player_weekly_points"\)\.update/)
})
