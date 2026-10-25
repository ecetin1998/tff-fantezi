import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
const optimizer=read("supabase/functions/run-staging-optimizer/index.ts")
const pitch=read("components/SquadPitchView.js")
const card=read("components/ManagerCardRecommendations.js")
const server=read("lib/data.js")
const teams=read("app/teams/[id]/page.js")
const api=read("app/api/scout-data/route.js")
const page=read("app/squads/page.js")

test("alternative XI maximizes canonical weighted top-three, recommended XI keeps xFP",()=>{
 assert.match(optimizer,/const modalObjective=\(r:any\)=>n\(r\.top3_weighted_avg\)\+\.00001\*n\(r\.xfp\)/)
 assert.match(optimizer,/variant==="recommended"\?xfp:modalObjective\(r\)/)
 assert.match(optimizer,/xi_sum_of_top3_weighted_avg_primary_xfp_tiebreak_v1/)
 assert.match(optimizer,/top3_weighted_avg,top3_coverage,top3_outcomes/)
 assert.match(optimizer,/TOP3_HISTOGRAM_NOT_FINALIZED_FOR_ALL_456/)
 assert.doesNotMatch(optimizer,/xi_sum_of_individual_modes_primary_xfp/)
})
test("field, bench and XI headline round presentation only",()=>{
 assert.equal(Math.round(5.29),5)
 assert.equal(Math.round(5.5),6)
 assert.equal(Math.round(-1.1),-1)
 assert.match(pitch,/Math\.round\(Number\(m\.top3_weighted_avg\|\|0\)\)/)
 assert.match(pitch,/Math\.round\(Number\(xiXfp\)\)/)
 assert.match(card,/Math\.round\(data\.members\.filter/)
 assert.match(pitch,/top3_outcomes/)
 assert.match(pitch,/top3_coverage/)
 assert.match(card,/TİPİK PUAN 11/)
})
test("public data reuse canonical projection, not duplicated SQL fields",()=>{
 assert.match(server,/top3_weighted_avg:p\?\.projection\?\.top3_weighted_avg/)
 assert.match(server,/top3_outcomes:p\?\.projection\?\.top3_outcomes/)
 assert.match(api,/top3_weighted_avg:m\.top3_weighted_avg/)
 assert.match(page,/Tipik Puan 11/)
 assert.doesNotMatch(optimizer,/typical_points/)
 assert.doesNotMatch(optimizer,/top3_score_distribution/)
})
test("team detail is entirely runtime dynamic to avoid Supabase build-time 401",()=>{
 assert.match(teams,/export const dynamic='force-dynamic'/)
 assert.match(teams,/export const dynamicParams=true/)
 assert.match(teams,/export async function generateStaticParams\(\)\{ return \[\] \}/)
 assert.doesNotMatch(teams,/generateStaticParams\(\)\{\s*const \{teams\}/)
})
