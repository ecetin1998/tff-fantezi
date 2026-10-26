import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const lifecycle=readFileSync("supabase/functions/weekly-model-lifecycle/index.ts","utf8");
test("current-MH audit tolerates already updated team rollups, not missing teams",()=>{
  assert.match(lifecycle,/\.select\("team_id,through_gameweek,advanced_matches,matches_played"\)\.gte\("through_gameweek",gw-1\)\.lte\("through_gameweek",gw\)/);
  assert.match(lifecycle,/const pass=prep\.pass&&realized\.pass&&teamAdvanced\.length===18/);
  assert.match(lifecycle,/no_writes:true/);
});
