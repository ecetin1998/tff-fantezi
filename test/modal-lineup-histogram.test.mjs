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
test("frequency-weighted top-three scores differ from xFP and single mode",()=>{
  const h=Array(256).fill(0)
  h[42]=16850 // 2
  h[48]=6650  // 8
  h[53]=4850  // 13
  h[47]=10000 // 7, other scenario
  h[41]=11650 // 1, other scenario
  const three=h.map((count,i)=>({score:i-40,count})).sort((a,b)=>b.count-a.count||Math.abs(a.score-6.87)-Math.abs(b.score-6.87)).slice(0,3)
  const typical=three.reduce((s,x)=>s+x.score*x.count,0)/three.reduce((s,x)=>s+x.count,0)
  assert.equal(mode(h,6.87).score,2)
  // Here the most frequent three are 2, 1, and 7.
  assert.deepEqual(three.map(x=>x.score),[2,1,7])
  assert.ok(typical>2)
  assert.ok(typical<6.87)
  assert.equal(h.reduce((a,b)=>a+b,0),50000)
})
test("modal columns are kept null before exact 50K finalize",()=>{
  assert.match(sql,/mode_points integer NULL/)
  assert.match(sql,/mode_probability numeric NULL/)
  assert.match(sql,/typical_points numeric NULL/)
  assert.match(sql,/top3_score_distribution jsonb NULL/)
  assert.match(sql,/sum\(points::numeric \* frequency\)\/nullif\(sum\(frequency\),0\)/)
  assert.match(sql,/jsonb_agg\(/)
  assert.match(sql,/top3_coverage/)
  assert.match(sql,/jsonb_array_length\(top3_score_distribution\) BETWEEN 1 AND 3/)
  assert.match(sql,/HAVING count\(\*\) BETWEEN 1 AND 3/)
  assert.match(sql,/a\.draws=50000/)
  assert.match(sql,/jsonb_array_length\(a\.hist\)=256/)
  assert.match(sql,/bin\.index-41/)
  assert.match(sql,/bin\.value::integer DESC/)
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.scout_finalize_modal_projection/)
  assert.match(finalizer,/scout_finalize_modal_projection/)
  assert.match(finalizer,/MODAL_SCORE_COVERAGE_INCOMPLETE/)
})
test("second uncarded 11 optimizes weighted top-three primary, xFP tie-break",()=>{
  assert.match(optimizer,/const modalObjective=\(r:any\)=>n\(r\.typical_points\)\+\.00001\*n\(r\.xfp\)/)
  assert.match(optimizer,/variant==="recommended"\?xfp:modalObjective\(r\)/)
  assert.match(optimizer,/typical_points:x\.typical_points/)
  assert.match(optimizer,/TOP3_HISTOGRAM_NOT_FINALIZED_FOR_ALL_456/)
  assert.match(optimizer,/xi_sum_of_top3_typical_points_primary_xfp_tiebreak_v1/)
  assert.doesNotMatch(optimizer,/aggressiveOverlap/)
  assert.doesNotMatch(optimizer,/aggressiveXfpFloor/)
})
test("typical card shows weighted top-three, not a single mode disguised as typical performance",()=>{
  assert.match(pitch,/top3_score_distribution/)
  assert.match(pitch,/typical_points/)
  assert.match(cards,/İlk 11 Tipik Puan toplamı/)
  assert.match(cards,/TİPİK PUAN 11/)
  const total=[2,1,0,2,2,1,1,2,0,2,1].reduce((a,b)=>a+b,0)
  assert.equal(total,14)
  // Team's modal total is NOT mathematically equal to sum of player top-three typical scores;
  // copy explicitly says the sum of individual conditional typical scores.
})

test("typical scores round to nearest whole number only for display, not optimizer scoring",()=>{
  assert.equal(Math.round(5.29),5)
  assert.equal(Math.round(5.50),6)
  assert.equal(Math.round(-1.4),-1)
  assert.match(pitch,/Math\.round\(Number\(m\.typical_points\|\|0\)\)/)
  assert.match(cards,/Math\.round\(data\.members\.filter/)
  assert.match(optimizer,/n\(r\.typical_points\)\+\.00001\*n\(r\.xfp\)/)
})
