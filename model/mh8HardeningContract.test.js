const fs=require('node:fs')
const assert=require('node:assert/strict')
const read=(path)=>fs.readFileSync(path,'utf8')

const availability=read('supabase/functions/refresh-availability/index.ts')
assert.match(availability,/for\(const player of playersQ\.data\|\|\[\]\)/,
  'Availability must cover every active roster member, not just injuries and old rows')
assert.match(availability,/if\(!Number\.isInteger\(id\)\|\|next\.has\(id\)\)continue/,
  'Inferred healthy baselines cannot override sourced injuries or suspensions')
assert.match(availability,/active_roster_no_reported_exception/,
  'Unobserved source exceptions are neutrally labeled, not source-confirmed as healthy')

const lifecycle=read('supabase/functions/weekly-model-lifecycle/index.ts')
assert.match(lifecycle,/targetSuspensionFixtures/,
  'Weekly rollover must create target-week suspension fixture descriptions')
assert.match(lifecycle,/av\.availability_type==="suspensions"/,
  'Only suspension records should have the displayed fixture reassigned')
assert.match(lifecycle,/timeZone:"Europe\/Istanbul"/,
  'Fixtures must use target location local dates')

const red=read('supabase/migrations/20261013013000_red_card_aware_team_minutes_qa.sql')
assert.match(red,/expected_red_minutes/,
  'QA must compare minute gaps against expected red-card losses')
assert.match(red,/0\.15::numeric/,
  'Red-card allowance must match the simulator per-player cap')
assert.match(red,/minute_sum > 990\.25\*fixture_count/,
  'QA must continue rejecting overallocated team minutes')

const roles=read('supabase/migrations/20261013015000_role_aware_defender_scoring_qa.sql')
assert.match(roles,/coalesce\(pa\.primary_role,'DEF_UNKNOWN'\)=coalesce\(pb\.primary_role,'DEF_UNKNOWN'\)/,
  'Defender parity must compare on-field role peers, never CB versus WB/FB')
assert.match(roles,/gk_captain/,
  'Do not disable goalkeeper captain checks')
assert.match(roles,/xi_over_1/,
  'Do not disable impossible first-XI probability checks')

console.log('MH8 long-term lifecycle source integrity passed')
