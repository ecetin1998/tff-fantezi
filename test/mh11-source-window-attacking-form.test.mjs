import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {alignAttackSourceWindow} from "../supabase/functions/weekly-model-lifecycle/sourceWindowAttack.mjs"
import {laggedVerifiedAttackForm} from "../supabase/functions/weekly-model-lifecycle/laggedVerifiedAttackForm.mjs"

const week=(gameweek,minutes,kind="mh10_owner_approved_independent_score_events")=>
 ({gameweek,minutes,is_final:true,source_kind:kind,source_updated_at:"2026-11-03T01:00:00Z",points:0})
const v=(gameweek,xg,xa,shots,key_passes)=>
 ({gameweek,xg,xa,shots,key_passes,observed_at:"2026-10-26T18:00:00Z"})

test("Muçi xG/xA are not diluted by MH10 minutes when the source covers MH9",()=>{
 const original={through_gameweek:10,advanced_through_gameweek:9,minutes:630,
  xg_total:1.12,xa_total:1.6,xa_per90:.21686746987951808,shots:20,key_passes:9}
 const before=structuredClone(original)
 const result=alignAttackSourceWindow({stats:original,weekly:[week(10,73)],targetWeek:11})
 assert.equal(result.aligned,true)
 assert.equal(result.coveredMinutes,557)
 assert.ok(Math.abs(result.xgPer90-(1.12*90/557))<1e-9)
 assert.ok(result.xaPer90>.2168&&result.xaPer90<.26)
 assert.ok(result.shotsPer90>3)
 assert.deepEqual(original,before)
})

test("Sorescu time-window xA inconsistency is bounded downward, not blindly retained",()=>{
 const s={through_gameweek:10,advanced_through_gameweek:9,minutes:837,
 xg_total:1.29,xa_total:.95,xa_per90:.145748987854251,shots:18,key_passes:11}
 const r=alignAttackSourceWindow({stats:s,weekly:[week(10,73)],targetWeek:11})
 assert.equal(r.coveredMinutes,764)
 assert.ok(r.xaPer90<.13 && r.xaPer90>.105)
 assert.ok(r.xgPer90>1.29*90/837)
})

test("missing or untrusted post-source minutes fail closed, not synthesized as 0",()=>{
 const s={through_gameweek:10,advanced_through_gameweek:7,minutes:600,xg_total:1,xa_total:1}
 assert.equal(alignAttackSourceWindow({stats:s,weekly:[week(8,70),week(9,80)],targetWeek:11}).aligned,false)
 assert.equal(alignAttackSourceWindow({stats:s,weekly:[week(8,70),week(9,80),week(10,0)],targetWeek:11}).aligned,false)
 assert.equal(alignAttackSourceWindow({stats:s,weekly:[week(8,70),week(9,80),{...week(10,75),is_final:false}],targetWeek:11}).aligned,false)
 const okay=alignAttackSourceWindow({stats:s,weekly:[week(8,70),week(9,80),week(10,75)],targetWeek:11})
 assert.equal(okay.aligned,true)
 assert.equal(okay.coveredMinutes,375)
})

test("two source-verified attacking weeks supply cautious Muçi xG/xA direction",()=>{
 const evidence=[v(8,.58,.15,3,3),v(9,.21,.8,3,4)]
 const weekly=[week(8,89),week(9,90),week(10,73)]
 const a=laggedVerifiedAttackForm({position:"MID",targetWeek:11,weekly,verified:evidence,
  xgPer90:.18,xaPer90:.25,cutoffAt:"2026-11-06T17:00:00Z"})
 assert.equal(a.applied,true)
 assert.deepEqual(a.weeks,[9,8])
 assert.ok(a.xgPer90>.18&&a.xgPer90<=.18*1.16+1e-9)
 assert.ok(a.xaPer90>.25&&a.xaPer90<=.25*1.16+1e-9)
 const fantasyPoints=weekly.map(x=>({...x,points:99}))
 assert.deepEqual(laggedVerifiedAttackForm({position:"MID",targetWeek:11,weekly:fantasyPoints,verified:evidence,
  xgPer90:.18,xaPer90:.25,cutoffAt:"2026-11-06T17:00:00Z"}),a)
})

test("Sorescu recent verified xG recedes despite previous rare high Fantasy scores",()=>{
 const r=laggedVerifiedAttackForm({position:"DEF",targetWeek:11,
  weekly:[week(8,90),week(9,90),week(10,73)],
  verified:[v(8,.16,.18,3,1),v(9,.08,.15,2,1)],
  xgPer90:.15,xaPer90:.12,cutoffAt:"2026-11-06T17:00:00Z"})
 assert.ok(r.xgPer90<.15)
 assert.ok(r.xaPer90<=.12*1.16)
})

test("stale, missing, leaked, one-week and 0-minute source values cannot fabricate form",()=>{
 const base={position:"MID",targetWeek:11,weekly:[week(8,90),week(9,90),week(10,70)],
  verified:[v(8,.3,.2,3,2),v(9,.3,.2,3,2)],xgPer90:.12,xaPer90:.10,
  cutoffAt:"2026-11-06T17:00:00Z"}
 const unchanged=o=>{
  const r=laggedVerifiedAttackForm({...base,...o});return r.applied===false&&r.xgPer90===.12&&r.xaPer90===.10
 }
 assert.ok(unchanged({verified:[v(9,.3,.2,3,2)]}))
 assert.ok(unchanged({weekly:[week(8,90),week(9,0)]}))
 assert.ok(unchanged({verified:base.verified.map(x=>({...x,observed_at:"2026-11-07T01:00:00Z"}))}))
 assert.ok(unchanged({verified:[v(7,.3,.2,3,2),v(8,.3,.2,3,2)]}))
 assert.ok(unchanged({position:"GK"}))
 const single=laggedVerifiedAttackForm({...base,verified:[v(8,0,0,0,0),v(9,2,1,4,4)]})
 assert.equal(single.applied,false)
})

test("both forecasting paths apply trusted source exposure and lagged production to source inputs only",()=>{
 const src=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
 assert.match(src,/alignAttackSourceWindow\(\{stats:s,weekly:rows,targetWeek:target\}\)/)
 assert.match(src,/alignAttackSourceWindow\(\{[\s\S]*?targetWeek:gw/)
 assert.match(src,/laggedVerifiedAttackForm\(/)
 assert.match(src,/rates\[0\]=attackForm\.xgPer90/)
 assert.match(src,/rates\[3\]=attackForm\.xaPer90/)
 assert.match(src,/source-window-attack-v1/)
 assert.match(src,/lagged-verified-form-v1/)
 assert.match(src,/laggedInStableSource=String\(stableInput\.source_note\|\|""\)\.includes\("lagged-verified-form-v1"\)/)
 assert.doesNotMatch(src,/scout_player_weekly_points"\)\.update\(/)
})
