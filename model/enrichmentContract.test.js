const fs=require('node:fs')
const assert=require('node:assert/strict')
;(async()=>{
  const {playerRoleLabel,roleIsDetailed}=await import('../lib/playerRole.js')

const migration=fs.readFileSync('supabase/migrations/20260928103000_player_roles_xa_team_tactical_profiles.sql','utf8')
for(const marker of [
  'primary_role','role_side','xa_total','xa_per90','xa_model_per90',
  'scout_match_attack_events','scout_team_tactical_profiles',
  'attack_left_share','conceded_left_share','goals_outside_box_share',
  'conceded_outside_box_share','goals_set_piece_share','goals_counter_share',
  'v_scout_player_model_features','effective_xa_per90','scout_enrichment_qa'
])assert.ok(migration.includes(marker),marker+' missing from enrichment migration')

assert.match(migration,/preseason_player_prior/)
assert.match(migration,/position_prior/)
assert.match(migration,/Do not backfill historical replay rows/)
assert.doesNotMatch(migration,/update public\.scout_replay_player_inputs[\s\S]*primary_role/i)

const hardening=fs.readFileSync('supabase/migrations/20260928104000_enrichment_security_indexes.sql','utf8')
assert.match(hardening,/scout_match_attack_events_no_browser_access/)
assert.match(hardening,/using\(false\)/)
assert.match(hardening,/scout_match_attack_events_assist_player_id_idx/)
assert.match(hardening,/scout_team_tactical_profiles_team_id_idx/)


const snapshot=fs.readFileSync('supabase/migrations/20260928130000_enrichment_reviewed_snapshot_sync.sql','utf8')
assert.match(snapshot,/reviewed enrichment/)
assert.match(snapshot,/jsonb_to_recordset/)
assert.match(snapshot,/effective_xa_per90/)
assert.match(snapshot,/big_chances/)
assert.match(snapshot,/set_piece_xga/)
assert.match(snapshot,/shot_conversion_rate/)
assert.match(snapshot,/xa_observed_covered/)

const data=fs.readFileSync('lib/data.js','utf8')
assert.match(data,/TEAM_TACTICAL_PUBLIC_COLUMNS/)
assert.match(data,/xa_model_per90/)
assert.match(data,/primary_role/)
assert.match(data,/scout_team_tactical_profiles/)
assert.match(data,/big_chances,big_chances_missed,shots_on_target_per_match/)
assert.match(data,/set_piece_goals,set_piece_xg,set_piece_goals_conceded,set_piece_xga/)

const playerPage=fs.readFileSync('app/players/[id]/page.js','utf8')
assert.match(playerPage,/playerRoleLabel/)
assert.match(playerPage,/xA \/ 90/)
assert.match(playerPage,/Takım hücum katkısı/)
const teamPage=fs.readFileSync('app/teams/[id]/page.js','utf8')
assert.match(teamPage,/Atak ve savunma profili/)
assert.match(teamPage,/Uzaktan goller/)
assert.match(teamPage,/Soldan yenen atak/)
assert.match(teamPage,/Hücuma en çok katkı/)
assert.match(teamPage,/Duran top üretimi/)
assert.match(teamPage,/Büyük şans/)
assert.match(teamPage,/Şut dönüşümü/)

assert.equal(playerRoleLabel({primary_role:'CB',role_side:'C'}),'Stoper')
assert.equal(playerRoleLabel({primary_role:'WB',role_side:'L'}),'sol kanat bek')
assert.equal(roleIsDetailed({primary_role:'DEF_UNKNOWN'}),false)
assert.equal(roleIsDetailed({primary_role:'FB'}),true)

const importer=fs.readFileSync('supabase/functions/ingest-scout-enrichment/index.ts','utf8')
assert.match(importer,/scout_match_attack_events/)
assert.match(importer,/scout_refresh_enrichment_profiles/)
assert.match(importer,/xa_per90:xa90/)
assert.doesNotMatch(importer,/xa_model_per90:xa90/,'observed current xA must not overwrite the prior/model xA')
assert.match(importer,/workflow_dispatch/)
assert.doesNotMatch(importer,/fetch\([^)]*sofascore|fetch\([^)]*fotmob/i)

  console.log('enrichment contract passed')
})().catch(error=>{console.error(error);process.exit(1)})
