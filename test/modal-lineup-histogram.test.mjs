import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const sql=readFileSync(new URL("../supabase/migrations/20261025135000_modal_lineup_distribution.sql",import.meta.url),"utf8")
const optimizer=readFileSync(new URL("../supabase/functions/run-staging-optimizer/index.ts",import.meta.url),"utf8")
const finalizer=readFileSync(new URL("../supabase/functions/run-live-sim-chunk/index.ts",import.meta.url),"utf8")
const pitch=readFileSync(new URL("../components/SquadPitchView.js",import.meta.url),"utf8")
const cards=readFileSync(new URL("../components/ManagerCardRecommendations.js",import.meta.url),"utf8")

// Mirrors the SQL's 256 bins (-40 to +215), ordered by frequency,
// nearest existing xFP, then lower point on an exact tie.
function mode(hist,xfp){
  assert.equal(hist.length,256)
  return hist.map((count,i)=>({score:i-40,count})).sort((a,b)=>
    b.count-a.count||Math.abs(a.score-xfp)-Math.abs(b.score-xfp)||a.score-b.score)[0]
}

test("50K modal score is the most frequent integer outcome, not the mean",()=>{
  const h=Array(256).fill(0)
  h[43]=20000 // 3 points
  h[50]=15000 // 10 points
  h[41]=15000 // 1 point
  assert.equal(h.reduce((a,b)=>a+b,0),50000)
  assert.equal(mode(h,6).score,3)
  assert.equal(mode(h,6).count/50000,.4)
  assert.equal((3*20000+10*15000+1*15000)/50000,4.5)
})
test("negative point bins, zero scores, ties resolve deterministically",()=>{
  const h=Array(256).fill(0)
  h[39]=20000 // -1 points
  h[45]=20000 // 5 points
  h[40]=10000 // 0 points
  assert.equal(mode(h,-.5).score,-1)
  assert.equal(mode(h,4.8).score,5)
  h.fill(0);h[40]=30000;h[41]=20000
  assert.equal(mode(h,9).score,0)
})
test("modal columns are kept null before exact 50K finalize",()=>{
  assert.match(sql,/mode_points integer NULL/)
  assert.match(sql,/mode_probability numeric NULL/)
  assert.match(sql,/a\.draws=50000/)
  assert.match(sql,/jsonb_array_length\(a\.hist\)=256/)
  assert.match(sql,/bin\.index-41/)
  assert.match(sql,/bin\.value::integer DESC/)
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.scout_finalize_modal_projection/)
  assert.match(finalizer,/scout_finalize_modal_projection/)
  assert.match(finalizer,/MODAL_SCORE_COVERAGE_INCOMPLETE/)
})
test("second uncarded 11 optimizes integer mode primary, xFP tie-break",()=>{
  assert.match(optimizer,/const modalObjective=\(r:any\)=>n\(r\.mode_points\)\+\.001\*n\(r\.xfp\)/)
  assert.match(optimizer,/variant==="recommended"\?xfp:modalObjective\(r\)/)
  assert.match(optimizer,/mode_points:x\.mode_points/)
  assert.match(optimizer,/MODE_HISTOGRAM_NOT_FINALIZED_FOR_ALL_456/)
  assert.match(optimizer,/xi_sum_of_individual_modes_primary_xfp_tiebreak_v1/)
  assert.doesNotMatch(optimizer,/aggressiveOverlap/)
  assert.doesNotMatch(optimizer,/aggressiveXfpFloor/)
})
test("mode card shows mode, not xFP disguised as modal performance",()=>{
  assert.match(pitch,/mode_probability/)
  assert.match(pitch,/mode_points/)
  assert.match(cards,/İlk 11 mod toplamı/)
  assert.match(cards,/MOD 11/)
  const total=[2,1,0,2,2,1,1,2,0,2,1].reduce((a,b)=>a+b,0)
  assert.equal(total,14)
  // Team total mode is NOT mathematically equal to sum of player modes;
  // copy must explicitly call this individual mode sum.
})
