import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Highlightly sync is a private, bounded, source-separated collector",()=>{
  const src=read("supabase/functions/highlightly-sync/index.ts");
  assert.match(src,/HIGHLIGHTLY_API_KEY/);
  assert.match(src,/scout_highlightly_sync_control/);
  assert.match(src,/x-sync-auth/);
  assert.match(src,/auth_sha256/);
  assert.match(src,/lease_owner/);
  assert.match(src,/provider_remaining/);
  assert.match(src,/DAILY_QUOTA_GUARD/);
  assert.match(src,/source = "highlightly"/);
  assert.match(src,/const LEAGUE = 173537/);
  assert.match(src,/.match_status==="Bitti"/);
  assert.match(src,/provider_status:"Finished"/);
  assert.match(src,/Math\.abs\(millis\(f.date\)-millis\(h.kickoff_at\)\)<=18/);
  assert.doesNotMatch(src,/sb\.from\("(scout_player_weekly_points|scout_player_season_stats|scout_team_tactical_profiles|scout_model_runs)"\)/);
});

test("provider has independent evidence and defaults to missing, never zeroed xG",()=>{
  const src=read("supabase/functions/highlightly-sync/index.ts");
  assert.match(src,/xg:optionalNumber\(v.expectedGoals\)/);
  assert.match(src,/xa:optionalNumber\(v.expectedAssists\)/);
  assert.match(src,/shots:optionalInt\(v.shotsTotal\)/);
  assert.match(src,/lineups_done/);
  assert.match(src,/uniqueMatch\(p,activeByTeam/);
  assert.match(src,/Math\.max\(0,Math\.trunc\(num\)\)/);
  const sql=read("supabase/migrations/20261117204700_highlightly_source_specific_rollups.sql");
  assert.match(sql,/security_invoker=true/);
  assert.match(sql,/scout_highlightly_player_rollup/);
  assert.match(sql,/scout_highlightly_team_rollup/);
  assert.match(sql,/REVOKE ALL ON public\.scout_highlightly_player_rollup/);
});

test("all source tables have RLS, no browser grants",()=>{
  const sql=read("supabase/migrations/20261117204000_highlightly_private_ingest.sql");
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,5);
  assert.equal((sql.match(/REVOKE ALL ON public\.scout_highlightly_/g)||[]).length,5);
  assert.match(sql,/CHECK \(source IN \('tff','highlightly'\)\)/);
});
