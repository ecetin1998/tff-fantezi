import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20261118103000_mh1_samsun_goztepe_fotmob_full_source.sql",import.meta.url),"utf8");

test("MH1 source repair is for the verified Samsunspor 3-3 Göztepe fixture only",()=>{
 assert.match(sql,/match_id=317792/);
 assert.match(sql,/home_team_id=15 AND away_team_id=10/);
 assert.match(sql,/home_goals=3 AND away_goals=3/);
 assert.match(sql,/DATE '2026-08-17'/);
 assert.match(sql,/matchId=5904712/);
 assert.match(sql,/fotmob_matchDetails_2026_gw1_source_verified/);
 assert.match(sql,/2\.80::numeric,1\.71::numeric,21,3,7/);
 assert.match(sql,/1\.71::numeric,2\.80::numeric,20,7,3/);
});

test("30 match players, including 2 games of verified historic inactive Ali Diabate, do not mutate current roster",()=>{
 assert.match(sql,/Ali Badra Diabaté/);
 assert.match(sql,/provider_player_id=101699507/);
 assert.match(sql,/player_id=441/);
 assert.match(sql,/team_full_name_review/);
 assert.match(sql,/Exactly 30 played FotMob player records required/);
 assert.match(sql,/Historical Ali Diabate mapping incomplete/);
 assert.match(sql,/scout_verified_weekly_attack/);
 assert.doesNotMatch(sql,/UPDATE public\.scout_players/i);
 assert.doesNotMatch(sql,/UPDATE public\.scout_player_projections/i);
 assert.doesNotMatch(sql,/UPDATE public\.scout_model_runs/i);
});

test("Source xG is kept distinct from 29 measured xA and one unknown field",()=>{
 assert.match(sql,/Ogün Bayrak/);
 assert.match(sql,/source shows 1 created chance/);
 assert.match(sql,/xg=0 AND xa IS NULL/);
 assert.match(sql,/xa_evidence='unknown_xa'/);
 assert.match(sql,/scout_verified_player_source_missing_metrics/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.scout_verified_player_source_missing_metrics/);
 assert.match(sql,/29 matching player provenance rows required/);
 assert.match(sql,/22 team metrics provenance incomplete/);
 assert.match(sql,/Verified 99\/99 sufficient matches not reached/);
});
