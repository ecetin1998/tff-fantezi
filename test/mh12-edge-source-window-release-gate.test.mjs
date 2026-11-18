import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const fn=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
const workflow=readFileSync(new URL("../.github/workflows/weekly-model-lifecycle.yml",import.meta.url),"utf8")
test("weekly lifecycle refuses new 50K until model source windows appear in actual prepared inputs",()=>{
  assert.match(fn,/RECENT_SOURCE_WINDOW_NOT_CONSUMED/)
  assert.match(fn,/sourceWindowAppliedPlayers<100/)
  assert.match(fn,/verifiedWindowQ\.data\|\|\[\]\)\.length!==inputRows\.length/)
  assert.match(fn,/source_window_applied_players:sourceWindowAppliedPlayers/)
  assert.match(fn,/RECENT_SOURCE_WINDOW_REUSED_CANDIDATE_UNVERIFIED/)
  assert.match(fn,/recent-mh8-11-fotmob-window-v1/)
})
test("GitHub refuses source-unverified MH12 before running 50,000 draws",()=>{
  const position=workflow.indexOf("source_window_applied_players // 0")
  const simulation=workflow.indexOf("name: Run 50K current-MH refresh")
  assert.ok(position>0&&position<simulation)
  assert.match(workflow,/New source window not consumed/)
  assert.match(workflow,/test "\$used" -ge 100/)
  assert.match(workflow,/source-window rates used/)
})
