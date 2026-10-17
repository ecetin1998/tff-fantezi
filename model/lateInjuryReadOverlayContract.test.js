const fs=require('node:fs');
const assert=require('node:assert/strict');
const sql=fs.readFileSync('supabase/migrations/20261017105000_late_availability_current_card_overlay.sql','utf8');
const source=fs.readFileSync('supabase/functions/refresh-availability/index.ts','utf8');
const lifecycle=fs.readFileSync('supabase/functions/weekly-model-lifecycle/index.ts','utf8');
assert.match(sql,/CREATE OR REPLACE VIEW public\.v_current_player_cards AS/);
assert.match(sql,/LEFT JOIN LATERAL/);
assert.match(sql,/a\.availability_probability < pr\.availability_probability/,
  'latest lower injury probability must cap previously simulated cards');
assert.match(sql,/future\.kickoff_at > now\(\)/,
  'only future fixtures may receive latest risk overlays');
assert.match(sql,/started\.kickoff_at <= now\(\)/,
  'after kickoff retain frozen predeadline scoring for backtest');
for(const stat of ['xi_probability','appearance_probability','over60_probability',
  'x_minutes','core_xfp','x_bonus','xfp','six_plus_probability','value_score',
  'expected_goals','expected_assists']){
  assert(sql.includes('(pr.'+stat+' * live_availability.factor)'),
    'late zero-availability must zero actionable '+stat);
}
assert.match(sql,/pr\.availability_probability AS projection_availability_probability/,
  'retain original simulation availability for displaying data freshness mismatch');
for(const stat of ['p25','p75','p90']){
  assert.match(sql,new RegExp('factor = 0 THEN 0::numeric ELSE NULL::numeric END\\)'),
    'no fictitious quantile interpolation for partially unavailable players');
}
assert.match(sql,/CASE WHEN live_availability.factor = 1 THEN pr.top25_rank ELSE NULL END/,
  'stale top25 ranks must not be shown as current');
assert.doesNotMatch(sql,/UPDATE public\.scout_player_projections|DELETE FROM|TRUNCATE|DROP VIEW|GRANT EXECUTE|GRANT SELECT/i,
  'freeze immutable model predictions and RLS boundaries');
assert.match(lifecycle,/CURRENT_WEEK_LOCKED/,
  'locked MH may not be recomputed behind official deadline');
assert.match(source,/onConflict:"run_id,player_id"/,
  'source availability can refresh separately and remains run-scoped');
console.log('late injury overlay guard, deadline freeze and Pro security contract PASS');
