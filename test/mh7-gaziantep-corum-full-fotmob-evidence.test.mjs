import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("MH7 Gaziantep–Çorum full-time FotMob match facts and source are audited",()=>{
 const sql=get("supabase/migrations/20261117190000_mh7_gaziantep_corum_fotmob_xg_verified.sql");
 assert.match(sql,/0\.99::numeric,2\.67::numeric/);
 assert.match(sql,/2\.67::numeric,0\.99::numeric/);
 assert.match(sql,/scout_verified_match_metric_provenance/);
 assert.match(sql,/source_kind/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/IF NOT FOUND OR fixture\.home_team_id<>18/);
});

test("MH7 FotMob verified player xG and xA come from full-match shotmap and playerStats",()=>{
 const sql=get("supabase/migrations/20261117193500_mh7_fotmob_player_attack_verified.sql");
 assert.match(sql,/https:\/\/www\.fotmob\.com\/tr\/matches\/gaziantep-fk-vs-corum-fk\/tzrbrsj/);
 assert.match(sql,/FotMob matchDetails 2026 MH7 independently matched FT playerStats\+shotmap/);
 assert.match(sql,/scout_verified_weekly_attack/);
 assert.match(sql,/scout_verified_player_match_metric_provenance/);
 assert.match(sql,/xa_evidence IN \('explicit_xa','no_explicit_xa'\)/);
 assert.match(sql,/Hansen|Sontje/i);
 assert.match(sql,/count\(\*\).*<>32/);
 assert.match(sql,/sum\(shots\)<>12 OR sum\(shots_on_target\)<>2/);
 assert.match(sql,/sum\(shots\)<>13 OR sum\(shots_on_target\)<>7/);
 assert.doesNotMatch(sql,/UPDATE public\.scout_highlightly_player_matches.*xg/);
});

test("MH7 team advanced metrics remain provider-consistent with player shotmap",()=>{
 const sql=get("supabase/migrations/20261117195000_mh7_fotmob_consistent_team_stats.sql");
 assert.match(sql,/fotmob_matchDetails_2026_gw7_tff_verified/);
 assert.match(sql,/keeper_saves/);
 assert.match(sql,/touches_in_opposition_box/);
 assert.match(sql,/set_piece_xg/);
 assert.match(sql,/scout_verified_match_metric_provenance/);
 assert.match(sql,/Photomob player totals do not reproduce FotMob team stats/);
});

test("Hansen nickname is tied to verified canonical player by explicit ID and club",()=>{
 const sql=get("supabase/migrations/20261117191500_hansen_verified_nickname_alias.sql");
 assert.match(sql,/Misjonne Juniffer Naigelino Hansen/);
 assert.match(sql,/provider_player_id=26063478/);
 assert.match(sql,/player_id=844/);
 assert.match(sql,/Hansen duplicate canonical identity within match/);
});
