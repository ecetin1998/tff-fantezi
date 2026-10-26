import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const weekly=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
const refresh=readFileSync(new URL("../supabase/functions/model-refresh-control/index.ts",import.meta.url),"utf8")

test("preparation blocks all completed football results before post-kickoff timeout",()=>{
 const section=weekly.slice(weekly.indexOf("async function prepareCurrentRefresh("),
    weekly.indexOf("  const deadline=kickoff-36e5",weekly.indexOf("async function prepareCurrentRefresh(")))
 assert.match(section,/ALL_FOOTBALL_RESULTS_FINAL_AWAITING_FANTASY_ACTUALS/)
 assert.match(section,/\.eq\("gameweek",gw\)/)
 assert.match(section,/\.length===9/)
 assert.match(section,/\.every\(\(m:any\)=>m\.match_status==="Bitti"/)
 assert.match(section,/m\.home_goals!==null&&m\.away_goals!==null/)
 assert.match(section,/refresh_required:false/)
 assert.match(section,/source_closure_required:true/)
})
test("late same-week model promotion is blocked without affecting next-week promotion",()=>{
 const start=refresh.indexOf('if(stage==="promote")')
 const end=refresh.indexOf('const q=await sb.rpc("scout_promote_run"',start)
 const guard=refresh.slice(start,end)
 assert.ok(start>=0&&end>start)
 assert.match(guard,/candidateWeek===Number\(activeQ\.data\.gameweek\)/)
 assert.match(guard,/!candidateQ\.data\.is_current/)
 assert.match(guard,/finalQ\.data\|\|\[\]\)\.length===9/)
 assert.match(guard,/ALL_FOOTBALL_RESULTS_FINAL_AWAITING_FANTASY_ACTUALS/)
 assert.match(guard,/promotion_blocked:true/)
 assert.match(guard,/status:409/)
})
