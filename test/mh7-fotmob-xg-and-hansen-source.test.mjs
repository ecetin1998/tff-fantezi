import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const get = (p) => readFileSync(new URL("../"+p, import.meta.url),"utf8");

test("MH7 verified team xG backfill uses FotMob values and avoids mixing source models",()=>{
 const sql=get("supabase/migrations/20261117190000_mh7_gaziantep_corum_fotmob_xg_verified.sql");
 assert.match(sql,/VALUES \(18::bigint,0\.99::numeric,2\.67::numeric,8::bigint\)/);
 assert.match(sql,/\(8::bigint,2\.67::numeric,0\.99::numeric,18::bigint\)/);
 assert.match(sql,/fixture\.home_goals<>0 OR fixture\.away_goals<>3/);
 assert.match(sql,/public\.scout_team_match_shot_zones/);
 assert.match(sql,/public\.scout_highlightly_team_matches/);
 assert.match(sql,/NOT EXISTS|IF EXISTS/i);
 assert.match(sql,/source_kind/);
 assert.match(sql,/scout_verified_match_metric_provenance/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.scout_verified_match_metric_provenance/);
 assert.match(sql,/ON CONFLICT \(season,gameweek,match_id,team_id\) DO NOTHING/);
 assert.doesNotMatch(sql,/UPDATE public\.scout_highlightly_team_matches.*xg/);
});

test("Hansen provider nickname is source confirmed, not shirt-number guessed",()=>{
 const sql=get("supabase/migrations/20261117191500_hansen_verified_nickname_alias.sql");
 assert.match(sql,/Misjonne Juniffer Naigelino Hansen/);
 assert.match(sql,/Sontje Hansen/);
 assert.match(sql,/provider_player_id=26063478/);
 assert.match(sql,/player_id=844/);
 assert.match(sql,/team_id=18/);
 assert.match(sql,/FIFA official 2026 squad list and Opta Analyst/);
 assert.match(sql,/Hansen duplicate canonical identity within match/);
 assert.match(sql,/RAISE EXCEPTION 'Hansen historical repair incomplete'/);
});
