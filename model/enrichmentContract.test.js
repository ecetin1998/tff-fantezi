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

const xaFill=fs.readFileSync('supabase/migrations/20260928133000_fill_reviewed_xa_v2.sql','utf8')
assert.match(xaFill,/fotmob_xa_per90_reviewed_2026-09-28/)
assert.match(xaFill,/and s\.xa_per90 is null/,'reviewed xA fill must never overwrite an observed value')
assert.match(xaFill,/effective_xa_per90/,'attack share refresh must retain fallback xA for uncovered players')
assert.match(xaFill,/xa_confidence=\.95/)
assert.doesNotMatch(xaFill,/set xa_model_per90=/,'observed xA must stay separate from the model prior')

const xaFillV3=fs.readFileSync('supabase/migrations/20260928150000_fill_reviewed_xa_v3.sql','utf8')
assert.match(xaFillV3,/fotmob_xa_total_exact_reviewed_2026-09-28/)
assert.match(xaFillV3,/fotmob_xa_total_1dp_reviewed_2026-09-28/)
assert.match(xaFillV3,/xa_confidence=\.95/)
assert.match(xaFillV3,/xa_confidence=\.70/)
assert.match(xaFillV3,/and s\.xa_per90 is null/,'v3 must never overwrite observed xA')
assert.match(xaFillV3,/\(420::bigint,0\.01::numeric/)
assert.match(xaFillV3,/\(258::bigint,0\.3::numeric/)
assert.match(xaFillV3,/effective_xa_per90/,'attack contribution refresh must use effective xA')
assert.doesNotMatch(xaFillV3,/set xa_model_per90=/,'observed xA must not overwrite the model prior')

const xaFillV4=fs.readFileSync('supabase/migrations/20260928153000_fill_reviewed_xa_v4.sql','utf8')
assert.match(xaFillV4,/fotmob_xa_leaderboard_1dp_reviewed_2026-09-28/)
assert.match(xaFillV4,/and s\.xa_per90 is null/,'v4 must never overwrite observed xA')
assert.match(xaFillV4,/\(1538,0\.1\)/,'Can Bozdoğan reviewed xA total must be preserved')
assert.match(xaFillV4,/\(1075,0\.0\)/,'Kevin Mouanga league-only xA must use league leaderboard value')
assert.match(xaFillV4,/shots_on_target=coalesce\(s\.shots_on_target,1\)/,'Taşkın current shot-map SOT should be filled')
assert.match(xaFillV4,/s\.player_id=500/,'Taşkın player id should be targeted')
assert.match(xaFillV4,/effective_xa_per90/,'attack contribution refresh must retain fallback for uncovered players')
assert.doesNotMatch(xaFillV4,/set xa_model_per90=/,'observed xA must not overwrite the model prior')

const finalPlayerGap=fs.readFileSync('supabase/migrations/20260928160000_close_player_enrichment_gaps.sql','utf8')
assert.match(finalPlayerGap,/player_id=236/,'Emircan Gürlük must close the last played observed-xA gap')
assert.match(finalPlayerGap,/xa_total=0\.1/)
assert.match(finalPlayerGap,/and s\.xa_per90 is null/,'identity-reviewed xA must never overwrite an observed value')
assert.match(finalPlayerGap,/canonical_wm_to_w_v1/)
assert.match(finalPlayerGap,/primary_role='WM'/)
assert.match(finalPlayerGap,/set primary_role='W'/)
assert.match(finalPlayerGap,/effective_xa_per90/,'attack contribution refresh must preserve effective xA fallback')
assert.doesNotMatch(finalPlayerGap,/set xa_model_per90=/,'observed xA must remain separate from model prior')

const reviewedActionsV2=fs.readFileSync('supabase/migrations/20260928163000_fill_reviewed_player_actions_v2.sql','utf8')
assert.match(reviewedActionsV2,/player_id=391/,'Saba reviewed action row must be targeted')
assert.match(reviewedActionsV2,/key_passes=coalesce\(s\.key_passes,1\)/)
assert.match(reviewedActionsV2,/crosses=coalesce\(s\.crosses,2\)/)
assert.match(reviewedActionsV2,/successful_crosses=coalesce\(s\.successful_crosses,1\)/)
assert.match(reviewedActionsV2,/player_id=396/,'Ousseynou Ba reviewed zero-shot row must be targeted')
assert.match(reviewedActionsV2,/player_id=85/,'Emirhan Boz reviewed zero-shot row must be targeted')
assert.match(reviewedActionsV2,/shots=coalesce\(s\.shots,0\)/,'reviewed zero-shot rows must fill only missing values')
assert.doesNotMatch(reviewedActionsV2,/set[\s\S]*takeons=0/i,'missing dribble data must remain unknown')
assert.doesNotMatch(reviewedActionsV2,/shot_share=/,'partial GW6 action fill must not recompute team shares')

const teamAdvancedSchema=fs.readFileSync('supabase/migrations/20260928111500_team_advanced_profiles_from_fresh_data.sql','utf8')
for(const field of [
  'advanced_profile_through_gameweek','set_piece_xg_share','opponent_set_piece_xg_share',
  'inferred_attack_left_share','inferred_attack_center_share','inferred_attack_right_share',
  'inferred_conceded_left_share','inferred_conceded_center_share','inferred_conceded_right_share',
  'scout_team_profile_qa'
])assert.match(teamAdvancedSchema,new RegExp(field))
assert.match(teamAdvancedSchema,/invalid_attack_share/)
assert.match(teamAdvancedSchema,/invalid_conceded_share/)
assert.match(teamAdvancedSchema,/\nfrom p;\n\$qa\$;/,'team profile QA must aggregate from its CTE')

const teamAdvancedFill=fs.readFileSync('supabase/migrations/20260928112000_fill_fresh_team_advanced_profiles.sql','utf8')
assert.match(teamAdvancedFill,/fresh_sheet_sahadan_gw1_5_2026-09-25/)
assert.match(teamAdvancedFill,/role_side_weighted_shots_chances_half_successful_crosses/)
assert.match(teamAdvancedFill,/advanced_profile_matches/)
assert.match(teamAdvancedFill,/inferred_conceded_right_share/)

const playerActionSchema=fs.readFileSync('supabase/migrations/20260928114000_player_advanced_action_profile.sql','utf8')
for(const field of ['crosses','successful_crosses','takeons','successful_takeons','shot_share','chance_creation_share','scout_player_enrichment_qa']){
  assert.match(playerActionSchema,new RegExp(field))
}
const playerActionFill=fs.readFileSync('supabase/migrations/20260928114500_fill_fresh_player_advanced_actions.sql','utf8')
assert.match(playerActionFill,/fresh_sheet_sahadan_gw1_5_2026-09-25/)
assert.match(playerActionFill,/season_zero_minutes/)
assert.match(playerActionFill,/source_team_id=e\.current_team_id/,'transfered players must not inherit old-club action share')

const data=fs.readFileSync('lib/data.js','utf8')
assert.match(data,/TEAM_TACTICAL_PUBLIC_COLUMNS/)
assert.match(data,/xa_model_per90/)
assert.match(data,/v_scout_player_model_features/)
assert.match(data,/effective_xa_per90/)
assert.match(data,/primary_role/)
assert.match(data,/crosses,successful_crosses,takeons,successful_takeons/)
assert.match(data,/shot_share,chance_creation_share/)
assert.match(data,/scout_team_tactical_profiles/)
assert.match(data,/big_chances,big_chances_missed,shots_on_target_per_match/)
assert.match(data,/set_piece_goals,set_piece_xg,set_piece_goals_conceded,set_piece_xga/)
assert.match(data,/advanced_profile_through_gameweek,advanced_profile_matches/)
assert.match(data,/inferred_attack_left_share,inferred_attack_center_share,inferred_attack_right_share/)

const playerPage=fs.readFileSync('app/players/[id]/page.js','utf8')
assert.match(playerPage,/playerRoleLabel/)
assert.match(playerPage,/xA \/ 90/)
assert.match(playerPage,/Model xA \/ 90/)
assert.doesNotMatch(playerPage,/Takım asist payı/)
assert.match(playerPage,/Takım hücum katkısı/)
assert.match(playerPage,/Şut payı/)
assert.match(playerPage,/Şans yaratma payı/)
assert.match(playerPage,/Dripling/)
const teamPage=fs.readFileSync('app/teams/[id]/page.js','utf8')
assert.match(teamPage,/Atak ve savunma profili/)
assert.match(teamPage,/Uzaktan goller/)
assert.match(teamPage,/Soldan yenen atak/)
assert.match(teamPage,/Hücuma en çok katkı/)
assert.match(teamPage,/Duran top üretimi/)
assert.match(teamPage,/Büyük şans/)
assert.match(teamPage,/Şut dönüşümü/)
assert.match(teamPage,/Hücum yönü/)
assert.match(teamPage,/Rakibin bize karşı hücum yönü/)
assert.match(teamPage,/Duran top xG payı/)
assert.match(teamPage,/gözlenen olay konumu gibi sunulmaz/)

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
