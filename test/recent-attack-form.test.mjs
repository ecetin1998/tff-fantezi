import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {recentAttackForm,fetchRecentAttackEvidence,groupRecentAttack} from "../supabase/functions/weekly-model-lifecycle/recentAttackForm.mjs"

const weekly=[8,7,6].map(gameweek=>({
  player_id:5,gameweek,minutes:90,is_final:true,source_kind:"fresh_closed_actual",points:gameweek===8?22:1
}))
const advanced=([s6,s7])=>[{gameweek:6,shots:s6,key_passes:2},{gameweek:7,shots:s7,key_passes:2}]
const verified=(s8,p8=2)=>[{gameweek:8,shots:s8,key_passes:p8}]
const form=(options={})=>recentAttackForm({
  position:"MID",targetWeek:9,weekly,
  advanced:advanced(4,4),verified:verified(4),
  seasonShotsPer90:2,seasonKeyPassesPer90:2,
  xgPer90:.3,xaPer90:.2,...options
})

test("repeatable source-backed high shot volume modestly lifts expected xG, not Fantasy-points",()=>{
  const first=form()
  assert.ok(first.applied)
  assert.ok(first.xgPer90>.3 && first.xgPer90<=.3*1.04+1e-9)
  assert.equal(first.xaPer90,.2)
  const unchangedPoints=form({weekly:weekly.map(x=>({...x,points:0}))})
  assert.equal(first.xgPer90,unchangedPoints.xgPer90)
})
test("3 verified matchweeks of low shots reduce only attacking channel",()=>{
  const low=form({advanced:advanced(0,0),verified:verified(0)})
  assert.ok(low.xgPer90<.3)
  assert.ok(low.xgPer90>=.3*.94-1e-10)
  assert.equal(low.xaPer90,.2)
})
test("one-match explosion never earns bonus when earlier two action counts were zero",()=>{
  const spike=form({advanced:advanced(0,0),verified:verified(10)})
  assert.equal(spike.xgPer90,.3)
  assert.equal(spike.shots.reason,"one_match_surge_not_repeatable")
})
test("missing latest evidence and missing historical actions do not become observed zero",()=>{
  const missing=form({advanced:advanced(4,4),verified:[{gameweek:8,shots:null,key_passes:null}]})
  assert.equal(missing.xgPer90,.3)
  assert.equal(missing.xaPer90,.2)
  const invalid=form({verified:verified(200)})
  assert.equal(invalid.xgPer90,.3)
})
test("no actual verified playing minutes, no update; riskless GK remains unchanged",()=>{
  const none=form({weekly:weekly.map(x=>({...x,is_final:false}))})
  assert.equal(none.xgPer90,.3)
  const zero=form({position:"GK"})
  assert.equal(zero.xgPer90,.3)
  assert.equal(zero.xaPer90,.2)
})
test("missing xA does not block valid xG form and missing xG does not block valid xA",()=>{
  const xgOnly=form({xaPer90:null})
  assert.ok(xgOnly.xgPer90>.3)
  assert.equal(xgOnly.xaPer90,null)
  const xaOnly=form({
    xgPer90:null,
    advanced:advanced(2,2).map(x=>({...x,key_passes:5})),
    verified:verified(2,5)
  })
  assert.equal(xaOnly.xgPer90,null)
  assert.ok(xaOnly.xaPer90>.2)
})
test("key-pass activity tunes xA independently of xG",()=>{
  const p=form({advanced:advanced(2,2).map(x=>({...x,key_passes:5})),verified:verified(2,5)})
  assert.ok(p.xaPer90>.2)
  assert.equal(p.xgPer90,.3)
})
test("insufficient/stale season baseline fails closed, no artificial zero rates",()=>{
  const missing=form({seasonShotsPer90:null,seasonKeyPassesPer90:null})
  assert.equal(missing.xgPer90,.3)
  assert.equal(missing.xaPer90,.2)
  const g=form({xgPer90:0})
  assert.equal(g.xgPer90,0)
})
test("verified provider stats win conflicts within the same gameweek",()=>{
  const verifiedFirst=form({
    advanced:[...advanced(4,4),{gameweek:8,shots:0,key_passes:0}],
    verified:verified(4,2)
  })
  assert.equal(verifiedFirst.xgPer90,form().xgPer90)
})
test("evidence fetch pages both sources and preserves 500-row boundaries",async()=>{
  const calls=[]
  const fake={
    from:(table)=>({
      select:()=>({
        eq(){return this},gte(){return this},lt(){return this},order(){return this},
        async range(start,end){calls.push({table,start,end});return {data:start===0?Array.from({length:500},(_,i)=>({player_id:i,gameweek:8})):[{player_id:500,gameweek:8}],error:null}}
      })
    })
  }
  const res=await fetchRecentAttackEvidence(fake,9)
  assert.equal(res.error,null)
  assert.equal(res.data.advanced.length,501)
  assert.equal(res.data.verified.length,501)
  assert.equal(calls.length,4)
  assert.equal(groupRecentAttack(res.data.advanced).size,501)
})
test("both lifecycle paths use stable inputs, form rates and source notes, with no role/point overwrite",()=>{
  const code=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  assert.match(code,/fetchRecentAttackEvidence\(sb,target\)/)
  assert.match(code,/fetchRecentAttackEvidence\(sb,gw\)/)
  assert.match(code,/recentAttackForm\(/)
  assert.match(code,/rates\[0\]=form\.xgPer90/)
  assert.match(code,/rates\[3\]=form\.xaPer90/)
  assert.match(code,/source_note:[\s\S]*?recent-attack-form-v2/)
  assert.match(code,/const stableRates=/)
  assert.doesNotMatch(code,/scout_player_weekly_points"\)\.update\(/)
})

test("two games or incomplete weekly evidence never changes rates, even with big spikes",()=>{
  const evidence=form({advanced:[{gameweek:7,shots:10,key_passes:10}],verified:verified(9,10)})
  assert.equal(evidence.xgPer90,.3)
  assert.equal(evidence.xaPer90,.2)
  assert.equal(evidence.shots.reason,"three_week_verified_coverage_required")
  const past=form({targetWeek:8,advanced:advanced(10,10),verified:[]})
  assert.equal(past.xgPer90,.3)
  assert.equal(past.xaPer90,.2)
  const minuteShort=form({weekly:weekly.map(x=>({...x,minutes:50}))})
  assert.equal(minuteShort.xgPer90,.3)
})
test("stable benchmark already carrying version 2 marker must not be multiplied again",()=>{
  const code=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  assert.match(code,/stableInput\.source_note\|\|""\)\.includes\("recent-attack-form-v2"\)/)
  assert.match(code,/recent-attack-form-v2/)
  assert.match(code,/auditMatchAllocation\(/)
  assert.match(code,/applyTeamMatchForm\(/)
  assert.match(code,/auditRealizedModel\(/)
})

test("source event timestamps must strictly precede target kickoff",()=>{
  const cutoffAt="2026-10-23T18:00:00Z"
  const timedWeekly=weekly.map(x=>({...x,source_updated_at:"2026-10-21T12:00:00Z"}))
  const timedAdvanced=advanced(4,4).map(x=>({...x,source_updated_at:"2026-10-20T12:00:00Z"}))
  const timedVerified=verified(4).map(x=>({...x,observed_at:"2026-10-20T12:00:00Z"}))
  const good=form({weekly:timedWeekly,advanced:timedAdvanced,verified:timedVerified,cutoffAt})
  assert.ok(good.xgPer90>.3)
  const after=form({weekly:timedWeekly,advanced:timedAdvanced,
    verified:timedVerified.map(x=>({...x,observed_at:"2026-10-23T18:01:00Z"})),cutoffAt})
  assert.equal(after.xgPer90,.3)
  const noDate=form({weekly:timedWeekly,advanced:timedAdvanced,
    verified:verified(4),cutoffAt})
  assert.equal(noDate.xgPer90,.3)
  const invalidCutoff=form({weekly:timedWeekly,advanced:timedAdvanced,
    verified:timedVerified,cutoffAt:"not-a-timestamp"})
  assert.equal(invalidCutoff.xgPer90,.3)
})
test("weekly and intraday inputs carry earliest target kickoff as timestamp cutoff",()=>{
  const code=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  assert.match(code,/cutoffAt:targetKickoff/)
  assert.match(code,/cutoffAt:kickoff/)
  const weeklySource=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/weeklyEvidence.mjs",import.meta.url),"utf8")
  assert.match(weeklySource,/source_kind,source_updated_at/)
})
