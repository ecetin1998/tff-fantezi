const fs=require('node:fs')
const assert=require('node:assert/strict')

const read=file=>fs.readFileSync(file,'utf8')

const matches=read('app/matches/page.js')
assert.doesNotMatch(matches,/%\$/,'match probabilities must never render %$')
assert.doesNotMatch(matches,/runtime Elo/,'Runtime Elo disclaimer must not repeat on every match card.')

const nextConfig=read('next.config.mjs')
for(const header of ['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy','Content-Security-Policy']){
  assert.match(nextConfig,new RegExp(header),header+' must be configured globally.')
}
assert.match(nextConfig,/frame-ancestors 'none'/)
assert.match(nextConfig,/object-src 'none'/)

const health=read('app/api/health/route.js')
assert.match(health,/VERCEL_GIT_COMMIT_SHA/)
assert.doesNotMatch(health,/\|\|'dev'/)

for(const file of ['app/layout.js','app/sitemap.js','app/robots.js','app/actions.js','README.md','scripts/smoke.sh']){
  assert.doesNotMatch(read(file),/tff-fantezi\.vercel\.app/,file+' must use the Cloudflare production origin')
}

const api=read('app/api/scout-data/route.js')
const feed=read('lib/scoutFeed.js')
assert.match(api,/name:p\.full_name\|\|p\.display_name\|\|p\.short_label/)
assert.match(api,/xa_per90:p\.attack_profile\?\.xa_per90/)
assert.match(feed,/name:p\.full_name\|\|p\.display_name\|\|p\.short_label/)
assert.match(feed,/name:m\.player\?\.full_name\|\|m\.player\?\.display_name\|\|m\.player\?\.short_label/)
assert.match(feed,/name:a\.player\?\.full_name\|\|a\.player\?\.display_name\|\|a\.player\?\.short_label/)

const data=read('lib/data.js')
assert.match(data,/const displayName=p=>p\?\.full_name\|\|p\?\.display_name\|\|p\?\.short_label/)
assert.match(data,/attack_profile:/)
assert.match(data,/xa_per90:row\.xa_per90/)
assert.match(data,/async function _getPlayersPage/)
for(const table of ['scout_player_projections','scout_player_season_stats','scout_match_predictions','scout_role_signals','scout_player_weekly_points']){
  assert.doesNotMatch(data,new RegExp("from\\('"+table+"'\\)\\s*\\.select\\('\\*'\\)"),table+' must use explicit public columns')
}
assert.match(data,/getPlayersForRunShared\(run\.id\)/)
assert.match(data,/getMatchesForRunShared\(run\.id\)/)
assert.match(data,/data:getTeamDetail:weekly/)
assert.match(data,/getTeamFixturesOverviewShared=unstable_cache/)
assert.match(data,/matches:fixtures/)
assert.match(data,/currentMatches:fixtures/)

const passwordSecurity=read('lib/passwordSecurity.js')
assert.match(passwordSecurity,/return 'password_check_failed'/,'Password breach-check outages must fail closed.')

const pitch=read('components/SquadPitchView.js')
assert.match(pitch,/function displayName\(player\)\{ return pitchPlayerLabel\(player\) \}/)
assert.doesNotMatch(pitch,/Alternatif \(tavan\) kaptan:/)

const builder=read('components/SquadBuilder.js')
assert.doesNotMatch(builder,/vice|yardımcı kaptan/i)
assert.match(builder,/filter\(p=>p\.position!==['"]GK['"]\)/)
assert.match(builder,/netGain=gain-hitCost/)

for(const file of ['rules/tff-fantasy.json','lib/rules.js','app/actions.js','app/squad/page.js']){
  assert.doesNotMatch(read(file),/vice_captain|VICE_CAPTAIN|yardımcı kaptan/i,file+' must not contain vice-captain support')
}

const playersPage=read('app/players/page.js')
const playersTable=read('components/PlayersTable.js')
assert.doesNotMatch(playersPage,/Suspense/)
assert.match(playersPage,/searchParams/)
assert.match(playersPage,/getPlayersPage/)
assert.doesNotMatch(playersTable,/useSearchParams/)
assert.match(playersTable,/const PAGE_SIZE=50/)
assert.match(playersTable,/router\.replace/)

const cf=read('.github/workflows/cloudflare-deploy.yml')
assert.match(cf,/branches: \[main\]/)
assert.match(cf,/NEXT_PUBLIC_BUILD_SHA: \$\{\{ github\.sha \}\}/)
assert.match(cf,/\/api\/health/)
assert.match(read('.github/workflows/post-deploy-smoke.yml'),/head_sha/)
assert.equal(fs.existsSync('vercel.json'),true)
const vercelConfig=JSON.parse(read('vercel.json'))
assert.equal(vercelConfig?.git?.deploymentEnabled,false,'Vercel Git deployments must stay disabled; Cloudflare is production.')
assert.equal(fs.existsSync('proxy.js'),false)
assert.equal(fs.existsSync('middleware.js'),true)

const optimizer=read('supabase/functions/run-staging-optimizer/index.ts')
assert.match(optimizer,/scout_game_rules/)
assert.doesNotMatch(optimizer,/for\(let t=1;t<=18;t\+\+\)/)
assert.match(optimizer,/pos!==["']GK["']/)
assert.match(optimizer,/AGGRESSIVE_XFP_FLOOR=\.965/)
assert.match(optimizer,/AGGRESSIVE_MIN_OVERLAP=7/)
assert.match(optimizer,/AGGRESSIVE_MAX_OVERLAP=9/)
assert.match(optimizer,/\.60\*xfp\+\.20\*p90\+\.10\*six\+\.10\*top25/)
assert.match(optimizer,/\.30\*xfp\+\.45\*p90\+\.15\*six\+\.10\*top25/)
assert.match(optimizer,/aggressiveOverlap=\{min:AGGRESSIVE_MIN_OVERLAP,max:AGGRESSIVE_MAX_OVERLAP\}/)
assert.match(optimizer,/aggressiveXfpFloor=\{min:n\(reference\.xfp\)\*AGGRESSIVE_XFP_FLOOR\}/)
assert.doesNotMatch(optimizer,/budgetPenaltyPerM|spendReward|benchValue|\.08\*playProbability/)
assert.match(optimizer,/score:base,/)
assert.match(optimizer,/score:-cheapBench/)
assert.match(optimizer,/\["workflow_dispatch","schedule","push"\]/,'Scheduled and protected main-push lifecycle must be allowed to call optimizer.')

console.log('full audit contract passed')
