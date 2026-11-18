import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const fn=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
const ci=readFileSync(new URL("../.github/workflows/weekly-model-lifecycle.yml",import.meta.url),"utf8")

test("current MH12 must consume source windows before it may create a new candidate",()=>{
 assert.match(fn,/const sourceWindowAppliedPlayers=inputRows\.filter/)
 assert.match(fn,/gw===12&&\(\(verifiedWindowQ\.data\|\|\[\]\)\.length!==inputRows\.length/)
 assert.match(fn,/sourceWindowAppliedPlayers<100/)
 assert.match(fn,/RECENT_SOURCE_WINDOW_NOT_CONSUMED/)
 const gate=fn.indexOf("const sourceWindowAppliedPlayers")
 const create=fn.indexOf("const runId=crypto.randomUUID()",gate)
 assert.ok(gate>0 && create>gate)
 assert.match(fn,/source_window_applied_players:sourceWindowAppliedPlayers/)
})
test("existing stale candidate cannot be silently reused under newer SHA",()=>{
 assert.match(fn,/RECENT_SOURCE_WINDOW_REUSED_CANDIDATE_UNVERIFIED/)
 assert.match(fn,/reusedQ\.count\|\|0/)
 assert.match(ci,/source_window_applied_players/)
 assert.match(ci,/New source window not consumed/)
 assert.match(ci,/test "\$used" -ge 100/)
})
test("real source blending is present in both code paths",()=>{
 assert.equal((fn.match(/blendRecentVerifiedAttackRates\(\{/g)||[]).length,2)
 assert.equal((fn.match(/scout_player_recent_verified_advanced_window/g)||[]).length,2)
})
