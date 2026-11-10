import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {starterDurationProfile} from "../supabase/functions/weekly-model-lifecycle/starterDuration.mjs"
import {calibrateAttackRates} from "../supabase/functions/weekly-model-lifecycle/roleAwareAttackRates.mjs"

const cutoff="2026-11-15T15:00:00Z"
const final=(week,minutes,at="2026-11-10T12:00:00Z")=>({
  gameweek:week,minutes,is_final:true,source_kind:"fresh_closed_actual",source_updated_at:at
})
const duration=(args={})=>starterDurationProfile({
  position:"DEF",seasonStarts:0,targetWeek:12,cutoffAt:cutoff,...args
})

test("sixteen-minute bench cameos cannot force 74-minute substitutes",()=>{
  const x=duration({weekly:[final(6,16),final(5,5),final(1,6)]})
  assert.deepEqual(x.durations,[78,88])
  assert.equal(x.reason,"no_pre_kickoff_starter_duration_evidence")
  assert.equal(x.duration_weights.reduce((a,b)=>a+b,0),1)
  assert.ok(x.durations.every(m=>m>=60))
})

test("verified prior starts are valid even when under 60; post-kickoff records are not",()=>{
  const x=duration({seasonStarts:2,weekly:[final(11,16)],verified:[
    {gameweek:11,started:true,verified:true,minutes:42,observed_at:"2026-11-10T10:00:00Z"},
    {gameweek:10,started:true,verified:true,minutes:81,observed_at:"2026-11-10T10:00:00Z"},
    {gameweek:9,started:true,verified:true,minutes:4,observed_at:"2026-11-16T00:00:00Z"},
  ]})
  assert.deepEqual(x.durations,[42,81])
  assert.equal(x.reason,"verified_starter_stints")
})

test("season starters may use sourced 60+ minutes but never stale or inferred DNP",()=>{
  const x=duration({seasonStarts:3,weekly:[
    final(11,84),final(10,12),final(9,72),
    final(8,90,"2026-11-16T00:00:00Z"),
    {...final(7,0),source_kind:"independently_calculated_source_events"}
  ]})
  assert.deepEqual(x.durations,[84,72])
})

test("sparse 27-minute fullback xG regresses; established verified shooter stays intact",()=>{
  const kaz=calibrateAttackRates({position:"DEF",role:"FB",seasonMinutes:27,
    seasonWeek:11,advancedWeek:7,shots:0,goalsPer90:0,xgPer90:.19*90/27,xaPer90:0,assistsPer90:0,
    hasSourcedXg:true})
  assert.ok(kaz.xgPer90<.08,JSON.stringify(kaz))
  assert.ok(kaz.applied)
  const shooter=calibrateAttackRates({position:"DEF",role:"FB",seasonMinutes:600,
    seasonWeek:11,advancedWeek:11,shots:12,goalsPer90:.02,xgPer90:.2,xaPer90:.08,assistsPer90:0,
    hasSourcedXg:true})
  assert.ok(shooter.xgPer90>=.19,JSON.stringify(shooter))
  const missing=calibrateAttackRates({position:"DEF",role:"FB",seasonMinutes:27,
    seasonWeek:11,advancedWeek:7,shots:null,goalsPer90:0,xgPer90:.65,xaPer90:0,assistsPer90:0,
    hasSourcedXg:false})
  assert.ok(missing.xgPer90>.50,"missing source is not a tiny-sample observation")
})

test("lifecycle refresh rebuilds durations and does not reuse contaminated baseline",()=>{
  const source=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  assert.match(source,/starterDurationProfile\(/)
  assert.match(source,/durationProfile\.durations/)
  assert.match(source,/starter-duration-source-gated-v2/)
  assert.doesNotMatch(source,/durations=trustedRows\.map\(/)
  assert.match(source,/hasSourcedXg:/)
})
