import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {blendRecentVerifiedAttackRates} from "../supabase/functions/weekly-model-lifecycle/recentVerifiedSeasonWindow.mjs"

const win={
  from_gameweek:8,to_gameweek:11,played_games:4,played_minutes:330,
  xg_observed_games:4,xg_observed_minutes:330,xg_per90:.48,
  xa_observed_games:2,xa_observed_minutes:182,xa_per90:.32,
  source_name:"FotMob_MH8_11_verified_match_level_exposure"
}
test("source-specific GW8–11 rates affect MH12 without pretending season totals are same scale",()=>{
 const res=blendRecentVerifiedAttackRates({xgPer90:.22,xaPer90:.13,window:win,targetWeek:12})
 assert.equal(res.reason,"fotmob_mh8_11_exposure_blended")
 assert.equal(res.usedXg,true)
 assert.equal(res.usedXa,true)
 assert.ok(res.xgPer90>.22&&res.xgPer90<.48)
 assert.ok(res.xaPer90>.13&&res.xaPer90<.32)
 assert.ok(res.sourceWeightXg<=.42 && res.sourceWeightXa<=.42)
})
test("missing xA never silently becomes zero",()=>{
 const res=blendRecentVerifiedAttackRates({xgPer90:.22,xaPer90:.16,window:{...win,xa_per90:null,xa_observed_games:1},targetWeek:12})
 assert.equal(res.xaPer90,.16)
 assert.equal(res.usedXa,false)
 assert.ok(res.xgPer90>.22)
})
test("inadequate sample or wrong GW or unverifiable method cannot alter rates",()=>{
 for(const mutated of [
   {...win,to_gameweek:10},
   {...win,source_name:"Highlightly_Basic"},
   {...win,played_games:1},
   {...win,played_minutes:90}
 ]){
   const r=blendRecentVerifiedAttackRates({xgPer90:.3,xaPer90:.2,window:mutated,targetWeek:12})
   assert.equal(r.usedXg,false);assert.equal(r.usedXa,false)
 }
 const low={...win,xg_observed_games:1,xg_observed_minutes:88,xa_observed_minutes:80}
 const r=blendRecentVerifiedAttackRates({xgPer90:.3,xaPer90:.2,window:low,targetWeek:12})
 assert.equal(r.xgPer90,.3); assert.equal(r.xaPer90,.2)
})
test("0 is source-verified valid, not an implicit missing zero",()=>{
 const r=blendRecentVerifiedAttackRates({xgPer90:.18,xaPer90:.11,window:{...win,xg_per90:0,xa_per90:null},targetWeek:12})
 assert.ok(r.xgPer90>=0&&r.xgPer90<.18)
 assert.equal(r.xaPer90,.11)
})
test("same stable inputs and same evidence remain deterministic",()=>{
 const args={xgPer90:.53,xaPer90:.22,window:win,targetWeek:12}
 assert.deepEqual(blendRecentVerifiedAttackRates(args),blendRecentVerifiedAttackRates(args))
})
test("both lifecycle prepare paths query verified window and tag model snapshots",()=>{
 const s=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
 assert.equal((s.match(/scout_player_recent_verified_advanced_window/g)||[]).length,2)
 assert.equal((s.match(/blendRecentVerifiedAttackRates\(\{/g)||[]).length,2)
 assert.ok((s.match(/recent-mh8-11-fotmob-window-v1/g)||[]).length>=2)
 assert.match(s,/advanced_actions_verified_appearances/)
 assert.match(s,/const actionsAligned=/)
 assert.match(s,/const keysObserved=/)
})


test("MH13 uses MH9–12 FotMob exposure; incomplete xA retains stable prior",()=>{
 const w={...win,from_gameweek:9,to_gameweek:12,source_name:"FotMob_MH9_12_verified_match_level_exposure"}
 const r=blendRecentVerifiedAttackRates({xgPer90:.22,xaPer90:.13,window:w,targetWeek:13})
 assert.equal(r.usedXg,true);assert.equal(r.xaPer90,.13);assert.equal(r.usedXa,false)
 const complete=blendRecentVerifiedAttackRates({xgPer90:.22,xaPer90:.13,window:{...w,xa_observed_games:4,xa_observed_minutes:330},targetWeek:13})
 assert.equal(complete.usedXa,true)
 assert.equal(blendRecentVerifiedAttackRates({xgPer90:.22,xaPer90:.13,window:win,targetWeek:13}).usedXg,false)
})
