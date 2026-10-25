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
  assert.ok(first.xgPer90>.3 && first.xgPer90<=.3*1.08+1e-9)
  assert.equal(first.xaPer90,.2)
  const unchangedPoints=form({weekly:weekly.map(x=>({...x,points:0}))})
  assert.equal(first.xgPer90,unchangedPoints.xgPer90)
})
test("2-3 matches of independently verified low shots reduce only attacking channel",()=>{
  const low=form({advanced:advanced(0,0),verified:verified(0)})
  assert.ok(low.xgPer90<.3)
  assert.ok(low.xgPer90>=.3*.88-1e-10)
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
  assert.match(code,/source_note:[\s\S]*?recent-attack-form-v1/)
  assert.match(code,/const stableRates=/)
  assert.doesNotMatch(code,/scout_player_weekly_points"\)\.update\(/)
})
