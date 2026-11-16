import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Historical provider requests only run for verified missing evidence",()=>{
 const s=file("supabase/functions/highlightly-sync/index.ts");
 assert.match(s,/getData\(sb,"scout_highlightly_fetch_requirements"/);
 assert.match(s,/need_box/);
 assert.match(s,/need_stats/);
 assert.match(s,/need_lineups/);
 assert.match(s,/if\(!m\.box_done && m\.need\.need_box\)/);
 assert.match(s,/if\(!m\.stats_done && m\.need\.need_stats\)/);
 assert.match(s,/if\(!m\.lineups_done && m\.need\.need_lineups\)/);
 assert.match(s,/strategy:"only-verified-evidence-gaps"/);
 assert.match(s,/!x\.box_done&&x\.need\.need_box/);
 assert.match(s,/!x\.stats_done&&x\.need\.need_stats/);
 assert.match(s,/!x\.lineups_done&&x\.need\.need_lineups/);
});

test("Existing provider done flags remain provenance, not fudged by skipped endpoints",()=>{
 const s=file("supabase/functions/highlightly-sync/index.ts");
 assert.doesNotMatch(s,/box_done:\s*true,\s*stats_done:\s*true,\s*lineups_done:\s*true/);
 assert.match(s,/patch\.box_done=true/);
 assert.match(s,/patch\.stats_done=true/);
 assert.match(s,/patch\.lineups_done=true/);
});

test("Independent original sources gate calls, older lineups intentionally deferred",()=>{
 const s=file("supabase/migrations/20261117033000_highlightly_selective_missing_source_views.sql");
 assert.match(s,/scout_verified_weekly_attack/);
 assert.match(s,/scout_verified_team_match_advanced/);
 assert.match(s,/scout_player_tactical_role_observations/);
 assert.match(s,/chance_rows/);
 assert.match(s,/complete_teams/);
 assert.match(s,/greatest\(7,/i);
 assert.match(s,/security_invoker=true/);
 assert.match(s,/REVOKE ALL ON public\.scout_highlightly_fetch_requirements/);
 assert.match(s,/REVOKE ALL ON public\.scout_highlightly_targeted_readiness/);
 assert.match(s,/pending_api_calls_minimum/);
 assert.match(s,/targeted_coverage_complete/);
 assert.match(s,/source_reconciled_to_player_and_team_profiles/);
});
