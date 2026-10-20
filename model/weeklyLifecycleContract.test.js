const fs=require('node:fs')
const assert=require('node:assert/strict')

const read=file=>fs.readFileSync(file,'utf8')

const workflow=read('.github/workflows/weekly-model-lifecycle.yml')
assert.match(workflow,/cron: '17 \* \* \* \*'/,'Weekly lifecycle must poll hourly and decide from closure state, not a fixed MH date.')
assert.match(workflow,/workflow_dispatch:/)
assert.doesNotMatch(workflow,/gh workflow run weekly-model-lifecycle\.yml/,'Scheduled event should execute the protected lifecycle directly.')
assert.match(workflow,/id-token: write/)
assert.match(workflow,/action":"status"/)
assert.match(workflow,/ready_to_advance/)
assert.match(workflow,/action":"close_backtest"/)
assert.match(workflow,/action:"prepare"/)
assert.match(workflow,/action:"prepare_current"/,'Current MH must be refreshable before kickoff when source data advances.')
assert.match(workflow,/code_sha:\$sha/,'Lifecycle must stamp the source commit SHA into generated runs.')
assert.match(workflow,/seq 0 24/,'Weekly simulation must run 25 x 2K chunks.')
assert.match(workflow,/draws=2000/)
assert.match(workflow,/--retry 5/,'Simulation chunks must retry transient Edge failures.')
assert.match(workflow,/--retry-all-errors/,'HTTP 546 and other transient Edge errors must be retried.')
assert.match(workflow,/sleep 1/,'Simulation chunks must be paced to avoid Edge bursts.')
assert.match(workflow,/mode=finalize/)
assert.match(workflow,/mode=recommended&run=\$RUN_ID/)
assert.match(workflow,/mode=alternative&run=\$RUN_ID/)
assert.match(workflow,/stage:"qa"/)
assert.match(workflow,/stage:"integrity"/)
assert.match(workflow,/stage:"bugfix"/)
assert.match(workflow,/stage:"replay"/)
assert.match(workflow,/stage:"model_gate"/)
assert.match(workflow,/action:"snapshot"/)
assert.match(workflow,/stage:"promote"/)
assert.ok(workflow.indexOf('stage:"model_gate"')<workflow.indexOf('action:"snapshot"'),'Validated model gate must run before the live snapshot.')
assert.ok(workflow.indexOf('stage:"model_gate"')<workflow.indexOf('stage:"promote"'),'Validated model gate must run before promotion.')
assert.match(workflow,/action:"verify"/)
assert.doesNotMatch(workflow,/MH7|gw=7|GAMEWEEK=7/,'Lifecycle workflow must not be tied to MH7.')

const worker=read('supabase/functions/weekly-model-lifecycle/index.ts')
assert.match(worker,/target=gw\+1/,'Target gameweek must derive from the current gameweek.')
assert.match(worker,/match_status==="Bitti"/)
assert.match(worker,/fantasy_closure==="KAPANDI"/)
assert.match(worker,/final_actual_matches/)
assert.match(worker,/SOURCE_NOT_READY/,'Candidate creation must fail closed until closure and target fixtures are complete.')
assert.match(worker,/weekly-auto:/,'Candidate generation must use an idempotency key.')
assert.match(worker,/sourceRevision\(status\.latest_source_at\)/,'Idempotency must include the latest source revision.')
assert.match(worker,/availability\.data/,'Availability freshness must contribute to the source revision.')
assert.match(worker,/current\.model_version/,'Weekly runs must inherit the validated current model engine.')
assert.match(worker,/async function linkLifecycle\(/,'Prepared candidates must persist their parent/source linkage.')
assert.match(worker,/candidate_run_id:runId/)
assert.match(worker,/source_run_id:current\.id/)
assert.match(worker,/scout_weekly_lifecycle/)
assert.doesNotMatch(worker,/ScoutPlus Weekly Auto v1/,'Weekly rollover must not silently introduce a new model engine.')
assert.match(worker,/scout_replay_player_inputs/)
assert.match(worker,/scout_replay_match_inputs/)
assert.match(worker,/scout_match_predictions/)
assert.match(worker,/scout_player_projections/)
assert.match(worker,/scout_role_signals/)
assert.match(worker,/scout_availability/)
assert.match(worker,/action==="close_backtest"/)
assert.match(worker,/action==="snapshot"/)
assert.match(worker,/action==="verify"/)
assert.match(worker,/prepareCurrentRefresh/,'Lifecycle worker must support same-gameweek pre-kickoff refresh.')
assert.match(worker,/AVAILABILITY_STALE/,'Current-week refresh must fail before simulation when availability is stale.')

assert.doesNotMatch(worker,/if\(now>=deadline\)return \{refresh_required:false,reason:"CURRENT_WEEK_LOCKED"/,
  'Official squad deadline must not block rolling forecast refresh through the gameweek.')
assert.match(worker,/const snapshotAllowed=now<kickoff/,
  'After first kickoff the model must allow refresh but skip historical re-snapshot.')
assert.match(worker,/lastKickoff\+3\*36e5/,
  'Continue updating until the last fixture can finish, not indefinitely after the week.')
assert.match(worker,/reason:"LAST_FIXTURE_WINDOW_ENDED_AWAITING_RESULTS"/,
  'Missing fixture/actual ingestion after final whistle must skip expensive 50K.')
assert.match(worker,/source_closure_required:true,next_gameweek:gw\+1/,
  'Return a useful diagnostic, never advance without final sourced actuals.')
assert.match(worker,/PRE_KICKOFF_BACKTEST_SNAPSHOT_REQUIRED/,
  'Postkickoff live refresh must fail closed without an immutable kickoff snapshot.')
assert.match(worker,/\.lt\("created_at",new Date\(kickoff\)\.toISOString\(\)\)/,
  'In-week source-model inputs may not include postkickoff actual results.')
assert.match(worker,/snapshot_allowed:snapshotAllowed/,
  'Refresh response tells GitHub whether the immutable snapshot can be updated.')
assert.match(worker,/FROZEN_BACKTEST_RUN_REQUIRED/,
  'Week-close must verify a pre-first-kickoff snapshot.')
assert.match(worker,/scout_close_live_backtest",\{p_run_id:frozen\.run_id\}/,
  'Live rolling run must never become the retrospective backtest baseline.')
assert.match(workflow,/echo "snapshot=\$\(printf '%s' "\$response" \| jq -r '\.snapshot_allowed \/\/ false'\)"/,
  'Workflow receives the protected snapshot decision.')
assert.match(workflow,/steps\.current_refresh\.outputs\.snapshot == 'true'/,
  'Backtest freeze can run only when pre-kickoff snapshot is still allowed.')
assert.match(workflow,/\- name: Promote refreshed current MH/,
  'Rolling predictions still pass ordinary QA, optimize and promote.')

assert.match(worker,/availabilityAge>24/)
assert.match(worker,/source_cutoff/)
assert.match(worker,/input_snapshot_hash/)
assert.match(worker,/code_sha/)
assert.match(worker,/config_version/)
assert.match(worker,/codeRevision/,'Intraday candidates must be keyed by code revision to avoid stale candidate reuse.')
assert.match(worker,/shareTotals/,'Intraday availability changes must renormalize team goal and assist shares.')
assert.match(worker,/stableRoleBenchmark/,'Intraday refresh must anchor lineup weights to a stable non-intraday baseline.')
assert.match(worker,/stableRoleMap/,'Intraday refresh must reuse baseline role weights instead of simulated XI outputs.')
assert.doesNotMatch(worker,/integratedXi\/availability/,'Simulated XI probability must never be fed back as a lineup weight.')
assert.doesNotMatch(worker,/gameweek\s*=\s*7|GAMEWEEK\s*=\s*7/)

const sim=read('supabase/functions/run-live-sim-chunk/index.ts')
assert.match(sim,/searchParams\.get\("gw"\)/)
assert.match(sim,/searchParams\.get\("run"\)/)
assert.match(sim,/searchParams\.get\("benchmark"\)/)
assert.match(sim,/mins\[i\]>60\?SCORING\.appearance_60:0/,'Official appearance rule is strictly >60 minutes.')
assert.match(sim,/mins\[i\]>=60&&score/,'Official clean-sheet minimum remains >=60 minutes.')
assert.match(sim,/scout_finalize_simulation_run/)
assert.match(sim,/scout_goal_distribution_config/)
assert.match(sim,/teamGoals\(match\.home_lambda\)/,'Live MC must use the gated goal-distribution sampler.')
assert.match(sim,/populate_match_predictions_nb/,'Finalized match cards must use the same gated NB2 distribution.')
assert.match(sim,/scout_game_rules/)
assert.doesNotMatch(sim,/const SCORING=\{/,'Weekly simulator must read scoring from canonical rules.')
assert.match(sim,/minDraws<50000/)
assert.doesNotMatch(sim,/live-mh7|GAMEWEEK=7|expected 449/)

const control=read('supabase/functions/model-refresh-control/index.ts')
assert.match(control,/upstream_configured/)
assert.match(control,/body\.strict!==false/)
assert.match(control,/stage==="bugfix"/)
assert.match(control,/stage==="model_gate"/)
assert.match(control,/engineSignature/)
assert.match(control,/sameEngine&&Boolean\(parentGate\.data\.backtest_pass\)&&\(sameConfig\|\|gatedGoalDistChange\)/,'Promotion requires an unchanged engine and either unchanged config or an approved component gate.')
assert.match(control,/gate_passed/)
assert.match(control,/gatedGoalDistChange/)
assert.match(control,/goalConfigFingerprint/,'Goal-distribution gate must validate the full active config fingerprint.')
assert.doesNotMatch(control,/stage==="current_context"/,'Current-week refresh must remain candidate-based and atomic.')
assert.doesNotMatch(sim,/scout_finalize_current_simulation_run/,'Current-week refresh must not mutate the published run in place.')
assert.match(control,/\.\.\.\(patch\.details\|\|\{\}\)/,'Release gate details must accumulate instead of replacing earlier QA evidence.')

const migration=read('supabase/migrations/20260928181000_weekly_lifecycle_runtime.sql')
assert.match(migration,/scout_finalize_simulation_run/)
assert.match(migration,/scout_snapshot_live_backtest/)
assert.match(migration,/scout_close_live_backtest/)
assert.match(migration,/90\*coalesce\(fc\.fixture_count,0\)/,'Run QA must allow DGW minutes.')
assert.match(migration,/minute_sum-990\*fixture_count/,'Team-minute invariant must scale for DGWs.')
assert.match(migration,/match_count>=18 and mod\(match_count,2\)=0/,'Run QA must accept valid DGW fixture counts.')
assert.match(migration,/refresh_top25_gb_v1/)
assert.match(migration,/refresh_top25_v23/)
const overlapGateFix=read('supabase/migrations/20260929164056_remove_optimizer_overlap_qa_gate.sql')
assert.doesNotMatch(overlapGateFix,/xi_overlap<=8|optimizer_ok and overlap_ok/,'XI overlap is diagnostic only; ceiling XI must not be forced to differ.')
assert.match(overlapGateFix,/'xi_overlap',\(select xi_overlap from overlap\)/)

const redCardMinuteQA=read('supabase/migrations/20261013012500_red_card_aware_minute_qa.sql')
assert.match(redCardMinuteQA,/minute_sum<984\*fixture_count/,'Migration must guard the legacy minute invariant.')
assert.match(redCardMinuteQA,/minute_sum<980\*fixture_count/,'Red cards must permit a bounded, sub-1.1% simulated playing-time deficit.')
assert.match(redCardMinuteQA,/minute_sum>990\.25\*fixture_count/,'Upper bound must remain strict to detect overallocated player minutes.')
assert.match(redCardMinuteQA,/pg_get_functiondef/,'Patch existing QA without changing other safety rules.')
assert.match(sim,/if\(rc\)\{/,'Expected minutes fall because the simulator models red-card early exits.')

assert.match(redCardMinuteQA,/expected_red_minutes/,'Migration must preserve an already-deployed rate-aware QA implementation.')

const availabilityWorker=read('supabase/functions/refresh-availability/index.ts')
assert.match(availabilityWorker,/for\(const player of playersQ\.data\|\|\[\]\)/,'Availability refresh must cover every active roster player, not only players on the injury/suspension exception feed.')
assert.match(availabilityWorker,/if\(!Number\.isInteger\(id\)\|\|next\.has\(id\)\)continue/,'Explicit injuries and suspensions must take precedence over inferred baselines.')
assert.match(availabilityWorker,/active_roster_no_reported_exception/,'Inferred baseline provenance must be explicit.')
assert.match(availabilityWorker,/availability_probability:1/,'No current source alert defaults to a neutral availability probability.')
assert.match(availabilityWorker,/onConflict:"run_id,player_id"/,'Availability writes remain idempotent.')

const redQa=read('supabase/migrations/20261013013000_red_card_aware_team_minutes_qa.sql')
assert.match(redQa,/expected_red_minutes/,'Team minute QA must allow only physically possible dismissal-related losses.')
assert.match(redQa,/0\.15::numeric/,'Red-card allowance must respect the simulator red-card event probability cap.')
assert.match(redQa,/0\.5 \* greatest\(coalesce\(p\.x_minutes,0\),0\)/,'Red-card loss must reflect shortened minutes after a dismissal.')
assert.match(redQa,/minute_sum > 990\.25\*fixture_count/,'Excess scheduled minutes must remain forbidden.')
assert.match(redQa,/scout_run_qa/,'Migration must preserve canonical model QA RPC.')

assert.match(worker,/targetSuspensionFixtures/,'MH rollover must derive suspension fixture labels from target match predictions.')
assert.match(worker,/av\.availability_type==="suspensions"/,'Only sourced suspension metadata should be rebound to the target fixture.')
const defenderRoleQa=read('supabase/migrations/20261013015000_role_aware_defender_scoring_qa.sql')
assert.match(defenderRoleQa,/coalesce\(pa\.primary_role,'DEF_UNKNOWN'\)=coalesce\(pb\.primary_role,'DEF_UNKNOWN'\)/,
  'Defender parity must compare equivalent sourced CB/FB/WB roles, not fundamentally different positions.')
assert.match(defenderRoleQa,/gk_captain/,'Existing GK captain safety gate remains active.')
assert.match(defenderRoleQa,/xi_over_1/,'Existing XI bounds gate remains active.')

const liveData=read('lib/data.js')
const publicApi=read('app/api/scout-data/route.js')
const edgeConfig=read('next.config.mjs')
const publishedWeekSmoke=read('scripts/verify-published-gameweek.sh')
const productionDeploy=read('.github/workflows/cloudflare-deploy.yml')

// Model promotion changes the DB's current run. Never store that flag in
// a fixed-key incremental cache: OpenNext/R2 may serve the previous MH for
// much longer than the configured revalidation interval.
assert.match(liveData,/export const getCurrentRun=cache\(_getCurrentRun\)/,'Current run query must be fresh for each request.')
assert.doesNotMatch(liveData,/const getCurrentRunShared=unstable_cache\(/,'Do not persistently cache the is_current pointer.')
assert.match(liveData,/getHomeOverviewBaseShared\(run\)/,'Home overview cache key must include the verified active run.')
assert.match(liveData,/getRecommendationBundleShared\(liveRunId/,'Squad bundle cannot span multiple gameweeks.')
assert.match(liveData,/getMatchesShared\(\(await getCurrentRun\(\)\)\?\.id/,'Fixture page must key cached payload to live run.')
assert.match(publicApi,/buildCached\(liveRun\?\.id\|\|'none',requested/,'Public API cache key must change at model promotion.')
assert.match(edgeConfig,/const privateEdgeRoutes=\[\s*'\/'/,'Homepage must not be served from a shared five-minute HTML CDN cache.')
assert.match(publishedWeekSmoke,/MH\$\{EXPECTED_GAMEWEEK\} xFP lideri/,'Production smoke must validate the visible homepage week.')
assert.match(publishedWeekSmoke,/\.gameweek/,'Production smoke must validate the public JSON week.')
assert.match(productionDeploy,/Verify site displays current gameweek/,'Cloudflare deploy must fail if site is still showing the prior MH.')
assert.match(productionDeploy,/workflow_dispatch:/,'Production deployment retains an explicit manual GitHub Actions trigger.')
assert.doesNotMatch(productionDeploy,/issue_comment:/,'Cloudflare production deployment cannot be triggered by issue comments after the one-time MH8 repair.')

console.log('weekly lifecycle contract passed')

const roundingMigration=read('supabase/migrations/20261019195000_red_card_qa_rounding_epsilon.sql')
assert.match(roundingMigration,/0\.05\*fixture_count/,'Only three seconds per match may cover stored xMinute rounding.')
assert.match(roundingMigration,/greatest\(6\*fixture_count,coalesce\(expected_red_minutes,0\)\+2\*fixture_count\)/,
  'Preserve the two-minute Monte Carlo red-card allowance and six-minute baseline.')
assert.match(roundingMigration,/minute_sum > 990\.25\*fixture_count/,
  'The strict maximum total minutes may not be widened.')
assert.match(roundingMigration,/0\.15::numeric/,
  'Keep the physically bounded red-card rate assumption.')
assert.doesNotMatch(roundingMigration,/update\s+(?:public\.)?scout_player_projections/i,
  'QA epsilon must not fabricate or rewrite any model player minutes.')
{
  const eyupLoss=990-980.59, expectedRed=7.386252631578947;
  assert(eyupLoss > Math.max(6,expectedRed+2),
    'Regression sample must still fail the unadjusted QA.')
  assert(eyupLoss <= Math.max(6,expectedRed+2)+.05,
    'Regression sample must pass the only 0.05-minute numerical epsilon.')
  assert(!(990-979 < Math.max(6,expectedRed+2)+.05),
    'A genuinely eleven-minute red-card discrepancy still fails.')
}

const precedenceFix=read('supabase/migrations/20261019200500_correct_red_card_minute_qa_operator_precedence.sql')
assert.match(roundingMigration,/new_condition text := '\(greatest\(6\*fixture_count,coalesce\(expected_red_minutes,0\)\+2\*fixture_count\)\+0\.05\*fixture_count\)'/,
  'Rounding epsilon must be SUBTRACTED from the 990-minute lower bound, not added to it.')
assert.match(precedenceFix,/correct_condition text := '\(greatest\(6\*fixture_count,coalesce\(expected_red_minutes,0\)\+2\*fixture_count\)\+0\.05\*fixture_count\)'/,
  'Existing production patch must correct SQL operator precedence explicitly.')
assert.match(precedenceFix,/unexpected existing minute QA/,
  'Hotfix must fail closed on a changed QA expression.')

assert.match(worker,/finalActiveIds\.size===activeIds\.size/,
  'a current gameweek cannot close with missing registered Fantasy players')
assert.match(worker,/finalActiveRows\.length===activeIds\.size/,
  'exactly one final point record per active Fantasy player is required')
assert.match(worker,/finalByMatch\.size===fixtureCount/,
  'every completed fixture needs source-closed player coverage')
assert.match(worker,/\.every\(ids=>ids\.size>=22\)/,
  'each fixture must include both starting elevens at minimum')
assert.match(worker,/validFinalWeeklyPlayerRow\(gw,w\)/,
  'full final-row validation cannot be bypassed')
const closureContract=read('supabase/functions/weekly-model-lifecycle/closureSource.mjs')
assert.match(closureContract,/sourceKind === "fresh_closed_actual"/,
  'official final source support must stay intact')
assert.match(closureContract,/Number\(gameweek\) === 8 && sourceKind === MH8_INDEPENDENT_SOURCE/,
  'owner-approved calculated closure must stay scoped to MH8')
assert.match(closureContract,/row\.is_final !== true/,
  'provisional calculated points may not become official actuals')
assert.match(closureContract,/minute == null \|\| points == null \|\| base == null \|\| bonus == null/,
  'missing components must not coerce to zero')
assert.match(closureContract,/p!==b\+bonusNum/,
  'a final Fantasy score must reconcile base and bonus')
assert.match(worker,/finalizedPlayerCoverage&&/,
  'new week advancement gate must enforce complete sourced player points')
