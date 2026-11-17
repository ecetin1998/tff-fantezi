import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Partial provider team statistics are stored with unknown xG and next endpoint still runs",()=>{
 const s=file("supabase/functions/highlightly-sync/index.ts");
 assert.match(s,/const noXgTeams=rows\.filter\(x=>x\.xg===null\)/);
 assert.match(s,/await upsert\("scout_highlightly_team_matches",rows,"season,match_id,team_id"\)/);
 assert.match(s,/patch\.stats_done=true/);
 assert.match(s,/SOURCE_TEAM_XG_UNAVAILABLE/);
 assert.match(s,/sourceGaps\.push/);
 assert.match(s,/if\(!m\.lineups_done && m\.need\.need_lineups\)/);
 assert.doesNotMatch(s,/rows\.some\(x=>x\.xg===null\)\)\s*throw/);
});

test("Skipped/retrieved source fields are not counted as verified model xG when null",()=>{
 const s=file("supabase/migrations/20261117185000_highlightly_partial_xg_gap_gate.sql");
 assert.match(s,/security_invoker=true/);
 assert.match(s,/source_reconciled_to_player_and_team_profiles/);
 assert.match(s,/unresolved_provider_player_xg/);
 assert.match(s,/unresolved_provider_team_xg/);
 assert.match(s,/xg IS NOT NULL OR xa IS NOT NULL/);
 assert.match(s,/count\(DISTINCT team_id\) FILTER\(WHERE xg IS NOT NULL\)/);
 assert.match(s,/m\.stats_done AND coalesce\(pt\.complete_xg_teams,0\)=2/);
 assert.match(s,/m\.box_done AND coalesce\(pc\.chance_players,0\)>=10/);
 assert.match(s,/REVOKE ALL ON public\.scout_highlightly_targeted_readiness/);
});
