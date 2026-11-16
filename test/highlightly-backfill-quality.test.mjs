import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = path => readFileSync(new URL("../"+path, import.meta.url),"utf8");

test("verified player aliases persist and cannot be spoofed by jersey alone", () => {
  const src=read("supabase/functions/highlightly-sync/index.ts");
  assert.match(src, /getData\(sb,"scout_highlightly_player_aliases"/);
  assert.match(src, /verifiedAliases=new Map/);
  assert.match(src, /VERIFIED_ALIAS_PROVIDER_NAME_DRIFT/);
  assert.match(src, /VERIFIED_ALIAS_HISTORICAL_CONFLICT/);
  assert.match(src, /AMBIGUOUS_CANONICAL_PLAYER_IN_SAME_MATCH/);
  assert.match(src, /alias\?\.playerId/);
  const sql=read("supabase/migrations/20261117020000_highlightly_player_aliases.sql");
  assert.match(sql, /team_full_name_review/);
  assert.match(sql, /provider_player_id, team_id, player_id/);
  assert.match(sql, /WHERE scout_highlightly_player_aliases\.player_id=EXCLUDED\.player_id/);
  assert.match(sql, /JOIN public\.scout_players p ON p\.id=c\.player_id AND p\.team_id=c\.team_id/);
  assert.match(sql, /RAISE EXCEPTION 'Existing provider identity conflict'/);
  assert.match(sql, /RAISE EXCEPTION 'Duplicate player identity within one match'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.scout_highlightly_player_aliases/);
});

test("backfill status is source coverage, not a claim that xFP model was updated", () => {
  const sql=read("supabase/migrations/20261117021000_highlightly_backfill_readiness.sql");
  assert.match(sql, /security_invoker=true/);
  assert.match(sql, /bool_and\(match_status='Bitti' AND fantasy_closure='KAPANDI'\)/);
  assert.match(sql, /m\.box_done AND m\.stats_done AND m\.lineups_done/);
  assert.match(sql, /false AS xfp_model_recalibrated/);
  assert.match(sql, /source_backfill_complete/);
  assert.match(sql, /REVOKE ALL ON public\.scout_highlightly_backfill_readiness/);
});
