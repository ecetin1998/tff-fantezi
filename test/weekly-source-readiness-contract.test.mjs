import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const workflow=readFileSync(new URL("../.github/workflows/weekly-model-lifecycle.yml",import.meta.url),"utf8")
const lifecycle=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
const source=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/closureSource.mjs",import.meta.url),"utf8")

test("signed weekly lifecycle reports actual readiness despite successful scheduler",()=>{
  assert.match(workflow,/Check whether current MH is fully closed/)
  assert.match(workflow,/ready_to_advance/)
  assert.match(workflow,/GITHUB_STEP_SUMMARY/)
  assert.match(workflow,/finalized_active_players/)
  assert.match(workflow,/team_stats_current/)
  assert.match(workflow,/target_fixture_count/)
  assert.match(workflow,/steps\.ingest\.outputs\.configured/)
  assert.match(workflow,/::warning title=MH/)
})
test("no automatic completion without 456 verified Fantasy final rows",()=>{
  assert.match(lifecycle,/finalActiveRows\.length===activeIds\.size/)
  assert.match(lifecycle,/finalizedPlayerCoverage/)
  assert.match(lifecycle,/fantasy_closure==="KAPANDI"/)
  assert.match(lifecycle,/completeCurrent&&targetReady/)
  assert.match(lifecycle,/if\(action==="close_backtest"\)/)
  assert.match(source,/sourceKind === "fresh_closed_actual"/)
  assert.match(source,/Number\(gameweek\) === 8/)
})
