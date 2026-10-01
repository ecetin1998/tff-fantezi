const fs=require('node:fs')
const path=require('node:path')
const {spawnSync}=require('node:child_process')
const assert=require('node:assert/strict')

const root=path.resolve(__dirname,'..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')

const cloudflare=read('.github/workflows/cloudflare-deploy.yml')
const postDeploy=read('.github/workflows/post-deploy-smoke.yml')
const health=read('app/api/health/route.js')
assert.match(cloudflare,/branches:\s*\[main\]/)
assert.match(cloudflare,/npm run deploy/)
assert.match(cloudflare,/NEXT_PUBLIC_BUILD_SHA:\s*\$\{\{ github\.sha \}\}/)
assert.match(cloudflare,/api\/health/)
assert.match(postDeploy,/EXPECTED_SHA:\s*\$\{\{ github\.event\.workflow_run\.head_sha \}\}/)
assert.match(health,/NEXT_PUBLIC_BUILD_SHA/)

for(const file of [
  'app/layout.js','app/sitemap.js','app/robots.js','app/actions.js',
  '.env.example','README.md','scripts/smoke.sh','.github/workflows/ci.yml',
  '.github/workflows/cloudflare-deploy.yml','.github/workflows/post-deploy-smoke.yml'
]){
  assert.doesNotMatch(read(file),/tff-fantezi\.vercel\.app/,file+' must not reference the old production domain')
}

const smokeSyntax=spawnSync('bash',['-n','scripts/smoke.sh'],{cwd:root,encoding:'utf8'})
assert.equal(smokeSyntax.status,0,smokeSyntax.stderr)
assert.match(read('scripts/smoke.sh'),/players\/419/)
assert.match(read('scripts/smoke.sh'),/teams\/14/)
assert.match(read('scripts/smoke.sh'),/EXPECTED_SHA/)
assert.match(read('scripts/smoke.sh'),/robots\.txt/)
assert.match(read('scripts/smoke.sh'),/sitemap\.xml/)

const matches=read('app/matches/page.js')
assert.doesNotMatch(matches,/<small>1-X-2<\/small><b>%\$\{/)
assert.match(matches,/<small>1-X-2<\/small><b>%\{/)

const data=read('lib/data.js')
for(const table of [
  'scout_player_projections','scout_player_season_stats','scout_match_predictions',
  'scout_role_signals','scout_player_weekly_points'
]){
  assert.equal(new RegExp("from\\('"+table+"'\\)\\.select\\(['\"]\\*['\"]\\)").test(data),false,table+' must use explicit public columns')
}
assert.match(data,/async function checked\(/)
assert.match(data,/data:getPlayerDetail:projection/)
assert.match(data,/data:getTeamDetail:season/)
assert.match(data,/async function _getRecommendation[\s\S]*offlineBuild\(\)/)
assert.match(data,/async function _getTeamFixturesOverview[\s\S]*offlineBuild\(\)/)
assert.doesNotMatch(data,/scout_match_predictions[\s\S]{0,300}limit\(1\)\.maybeSingle\(\)/)

assert.match(data,/const displayName=p=>p\?\.full_name\|\|p\?\.display_name\|\|p\?\.short_label/)
const feed=read('lib/scoutFeed.js')
const api=read('app/api/scout-data/route.js')
assert.match(feed,/name:m\.player\?\.full_name\|\|m\.player\?\.display_name\|\|m\.player\?\.short_label/)
assert.match(feed,/name:p\.full_name\|\|p\.display_name\|\|p\.short_label/)
assert.match(api,/name:p\.full_name\|\|p\.display_name\|\|p\.short_label/)
assert.doesNotMatch(api,/name:p\.short_label\|\|/)
assert.doesNotMatch(feed,/name:p\.short_label\|\|/)

const pitch=read('components/SquadPitchView.js')
const builder=read('components/SquadBuilder.js')
assert.match(pitch,/pitchPlayerLabel/)
assert.match(builder,/pitchPlayerLabel/)
assert.doesNotMatch(pitch,/Alternatif \(tavan\) kaptan:/)
assert.match(builder,/p=>p&&p\.position!=='GK'/)
assert.match(builder,/p\.position!=='GK'\?<button[^\n]+captain-toggle/)
assert.match(builder,/map\.get\(captainId\)\?\.position!=='GK'/)
assert.doesNotMatch(builder,/club-counts">\$/)
assert.doesNotMatch(builder,/bütçe kullanılmıyor/i)
assert.match(builder,/Kalan: \{bank\.toFixed\(1\)\}m/)
for(const file of ['app/actions.js','app/squad/page.js','components/SquadBuilder.js','rules/tff-fantasy.json','lib/rules.js']){
  assert.doesNotMatch(read(file),/vice_captain|VICE_CAPTAIN|Yardımcı kaptan|Yrd\. kaptan/i,file+' must not expose vice captain')
}

const edge=read('supabase/functions/run-staging-optimizer/index.ts')
assert.match(edge,/const budget=n\(rules\.budget\)/)
assert.match(edge,/new Set\(rows\.map\(r=>Number\(r\.team_id\)/)
assert.match(edge,/if\(pos!=="GK"\)/)
assert.match(edge,/AGGRESSIVE_XFP_FLOOR=\.965/)
assert.match(edge,/AGGRESSIVE_MIN_OVERLAP=7/)
assert.match(edge,/AGGRESSIVE_MAX_OVERLAP=9/)
assert.match(edge,/aggressiveScore\(r,scale,true\)/)
assert.doesNotMatch(edge,/budgetPenaltyPerM|spendReward|benchValue|\.08\*playProbability/)
assert.match(edge,/const cheapBench=\.0001\*price/)
assert.match(edge,/score:base,/)
assert.match(edge,/score:-cheapBench/)
assert.doesNotMatch(edge,/\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18\]/)

const optimizerRefresh=read('.github/workflows/optimizer-refresh.yml')
assert.match(optimizerRefresh,/workflow_dispatch:/)
assert.match(optimizerRefresh,/mode=recommended/)
assert.match(optimizerRefresh,/mode=alternative/)
assert.doesNotMatch(optimizerRefresh,/schedule:/)

const replayEdge=read('supabase/functions/run-replay-distribution-test/index.ts')
assert.match(replayEdge,/DGW fixtures are independent matches/)
assert.match(replayEdge,/drawXi\[i\]=Math\.max\(drawXi\[i\],start\[i\]\)/)
assert.match(replayEdge,/oppSot\*saveRate\*ex/)
assert.match(replayEdge,/cards\[i\]=rc\?-3:\(yc\?-1:0\)/)
const mh1Edge=read('supabase/functions/run-mh1-replay-chunk/index.ts')
assert.match(mh1Edge,/oppSot\*saveRate\*ex/)
assert.match(mh1Edge,/cards\[i\]=rc\?-3:\(yc\?-1:0\)/)

const playersPage=read('app/players/page.js')
const playersTable=read('components/PlayersTable.js')
assert.doesNotMatch(playersPage,/Suspense/)
assert.match(playersTable,/const PAGE_SIZE=50/)
assert.match(playersPage,/searchParams/,'Player list filters must be resolved on the server.')
assert.match(playersPage,/getPlayersPage/)
assert.doesNotMatch(playersTable,/initialSearchParams/,'Player list must receive resolved filter state from the server.')
assert.doesNotMatch(playersTable,/urlReady/)
assert.match(playersTable,/router\.replace/)
const playerDetailRoute=read('app/players/[id]/page.js')
assert.match(playerDetailRoute,/dynamic='force-static'/,'Player detail should use on-demand ISR to avoid per-request Worker SSR.')
assert.match(playerDetailRoute,/ProPlayerAnalysis/,'Advanced Pro analytics should load through the protected lazy panel.')
assert.match(playerDetailRoute,/if\(!data\) notFound\(\)/,'Unknown player ids must still resolve through notFound().')
assert.match(playerDetailRoute,/generateStaticParams\(\)\{ return \[\] \}/,'Player detail ids should be generated on demand and cached.')

assert.match(data,/unstable_cache\(_getTeamDetail/)
assert.match(data,/currentMatches:fixtures/)
assert.match(read('app/players/[id]/page.js'),/fixtures\.map/)
assert.match(read('app/teams/[id]/page.js'),/currentMatches\.map/)

const readme=read('README.md')
assert.match(readme,/449 aktif oyuncu/)
assert.match(readme,/18 takım \/ 34 maç haftası/)
assert.match(read('lib/teamThemes.js'),/'Alanyaspor': \{ primary:'#F58220', secondary:'#168B4B'/)

const pkg=JSON.parse(read('package.json'))
const lock=JSON.parse(read('package-lock.json'))
assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies,'package lock runtime dependencies must match package.json')
assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies,'package lock dev dependencies must match package.json')

const migration=read('supabase/migrations/20260927213000_bugfix_rules_qa_and_remove_vice.sql')
assert.match(migration,/between 1 and 34/)
assert.match(migration,/drop column if exists vice_captain_id/)
assert.match(migration,/p\.position='GK'/)
assert.match(migration,/'gk_captain'/)
assert.match(migration,/'xi_over_1'/)
assert.match(migration,/'unexplained_same_team_def_xfp_diff'/)

const guardrails=read('supabase/migrations/20260928083313_optimizer_audit_guardrails.sql')
assert.match(guardrails,/scout_squad_members_captain_guard/)
assert.match(guardrails,/GK_CAPTAIN_NOT_ALLOWED/)
assert.match(guardrails,/CAPTAIN_MUST_BE_STARTER/)
assert.match(guardrails,/\)>\.3/)
assert.match(guardrails,/security invoker/)
assert.doesNotMatch(guardrails,/security definer/)

const simulator=read('model/simulateScout.js')
assert.match(simulator,/function appearancePoints\(minutes\)/)
assert.match(simulator,/mins>60\?SCORING\.appearance_60:0/,'official TFF second appearance point starts above 60 minutes')
assert.match(simulator,/mins\[i\]>=60&&score\[/,'clean sheet must require at least 60 minutes and a team match clean sheet')
for(const file of [
  'supabase/functions/run-enrichment-replay-chunk/index.ts',
  'supabase/functions/run-mh1-replay-chunk/index.ts',
  'supabase/functions/run-replay-distribution-test/index.ts'
]){
  const replay=read(file)
  assert.match(replay,/mins\[i\]>60/,'replay appearance threshold must stay strictly above 60: '+file)
  assert.match(replay,/mins\[i\]>=60/,'replay clean-sheet/60+ probability threshold must stay inclusive: '+file)
}

console.log('bugfix contract passed')
