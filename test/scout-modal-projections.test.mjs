import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const file=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8")
const distribution=(hist,draws)=>{
  assert.equal(hist.length,256)
  assert.equal(hist.reduce((sum,n)=>sum+n,0),draws)
  const scored=hist.map((n,i)=>({score:i-40,count:n})).sort((a,b)=>b.count-a.count||a.score-b.score)
  return {mode_points:scored[0].score,mode_probability:scored[0].count/draws}
}
test("score histogram uses 256 buckets offset -40 and exact frequency / 50K",()=>{
  const hist=Array(256).fill(0)
  hist[40+2]=16000
  hist[40+6]=12000
  hist[40+11]=22000
  assert.deepEqual(distribution(hist,50000),{mode_points:11,mode_probability:.44})
})
test("ties choose lower whole Fantasy points and do not round modal score",()=>{
  const hist=Array(256).fill(0)
  hist[40+2]=25000
  hist[40+6]=25000
  assert.deepEqual(distribution(hist,50000),{mode_points:2,mode_probability:.5})
})
test("distribution may have zero or negative mode and is NOT expected Fantasy points",()=>{
  const hist=Array(256).fill(0)
  hist[40]=30000
  hist[42]=20000
  assert.equal(distribution(hist,50000).mode_points,0)
  const negative=Array(256).fill(0)
  negative[38]=30000
  negative[40]=20000
  assert.equal(distribution(negative,50000).mode_points,-2)
})
test("migration checks 50K completeness, histogram mass, probability and unchanged public Pro isolation",()=>{
  const sql=file("supabase/migrations/20261025190000_simulation_player_mode_predictions.sql")
  assert.match(sql,/jsonb_array_length\(a\.hist\)=256/)
  assert.match(sql,/h\.ord::integer - 41/)
  assert.match(sql,/ORDER BY f\.observed DESC,f\.points ASC/)
  assert.match(sql,/score_rank=1 AND histogram_total=draws/)
  assert.match(sql,/v_updated<>v_expected/)
  assert.match(sql,/security_invoker = true/)
  assert.match(sql,/v_current_player_cards_public/)
  assert.match(sql,/mode_probability/)
  assert.doesNotMatch(sql,/\b(histogram|p25|p90|expected_assists)\s+as\s+(histogram|p25|p90|expected_assists)/i)
})
test("50K finalizer fails closed on missing modal data before optimizer and NB2",()=>{
  const code=file("supabase/functions/run-live-sim-chunk/index.ts")
  assert.ok(code.indexOf('sb.rpc("scout_apply_modal_predictions"')>code.indexOf('sb.rpc("scout_finalize_simulation_run"'))
  assert.ok(code.indexOf('sb.rpc("scout_apply_modal_predictions"')<code.indexOf('sb.rpc("populate_match_predictions_nb"'))
  assert.match(code,/Number\(modal\.data\)!==expectedPlayers/)
  assert.match(code,/MODE_HISTOGRAM_COVERAGE_FAILED/)
})
test("public data has mode score and probability; optimizer still prioritizes xFP",()=>{
  const lib=file("lib/data.js")
  const ui=file("components/PlayersTable.js")
  const api=file("app/api/scout-data/route.js")
  assert.match(lib,/mode_points,mode_probability/)
  assert.match(lib,/mode_points:row\.mode_points\?\?null/)
  assert.match(ui,/Tipik puan/)
  assert.match(ui,/Math\.round\(Number\(p\.projection\.top3_weighted_avg\)\)/)
  assert.doesNotMatch(ui,/Medyan/)
  assert.doesNotMatch(ui,/top3_coverage/)
  assert.doesNotMatch(ui,/median_points/)
  assert.doesNotMatch(ui,/<small className="cell-note">/)
  assert.match(ui,/<td><b>\{p\.projection\?\.top3_weighted_avg/)
  assert.match(ui,/f\.sort\|\|'xfp'/)
  assert.match(api,/top3_weighted_avg:p\.projection\.top3_weighted_avg/)
  assert.match(file("app/players/[id]/page.js"),/Tipik puan/)
  assert.match(file("supabase/functions/weekly-model-lifecycle/index.ts"),/auditRealizedModel/)
})

test("top-three weighted score rounds ONLY in the presentation, not in stored values",()=>{
 const sql=file("supabase/migrations/20261025191500_simulation_median_and_top3_weighted.sql")
 const fix=file("supabase/migrations/20261025192000_modal_top3_single_outcome_support.sql")
 const ui=file("components/PlayersTable.js")
 const detail=file("app/players/[id]/page.js")
 assert.match(sql,/SUM\(points::numeric\*observed\)/)
 assert.match(sql,/top3_coverage/)
 assert.match(sql,/top3_outcomes/)
 assert.match(fix,/jsonb_array_length\(top3_outcomes\) BETWEEN 1 AND 3/)
 assert.match(ui,/Math\.round\(Number\(p\.projection\.top3_weighted_avg\)\)/)
 assert.match(detail,/Math\.round\(Number\(p\.top3_weighted_avg\)\)/)
 assert.equal(Math.round(5.293),5)
 assert.equal(Math.round(4.743),5)
 assert.equal(Math.round(2),2)
})
