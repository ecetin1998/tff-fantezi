const fs=require('node:fs')
const assert=require('node:assert/strict')

const data=fs.readFileSync('lib/data.js','utf8')
const home=fs.readFileSync('app/page.js','utf8')
const squad=fs.readFileSync('app/squad/page.js','utf8')

const section=(start,end)=>{
  const s=data.indexOf(start)
  const e=data.indexOf(end,s)
  assert.ok(s>=0&&e>s,'missing section '+start)
  return data.slice(s,e)
}

const playerLoader=section('async function _loadPlayersForRun','async function _getPlayersWithProjection')
const players=section('async function _getPlayersWithProjection','const HOME_PLAYER_COLUMNS')
const availability=section('async function _getAvailability','async function _getRoleSignals')
const roles=section('async function _getRoleSignals','export async function getAuthState')
const team=section('async function _getTeamDetail','async function _getBacktestOverview')
const matches=section('async function _getMatches','async function _getRecommendation')
const recommendation=section('async function _getRecommendation','async function _getAvailability')
const squadPool=section('async function _loadSquadPlayerPool','async function _getSquadPlayerPool')

assert.match(playerLoader,/\.eq\('run_id',runId\)/)
assert.match(data,/players-for-current-run-v2/)
assert.match(players,/const run=await getCurrentRun\(\)/)
assert.match(players,/getPlayersForRunShared\(run\.id\)/)
assert.match(availability,/\.eq\('run_id',run\.id\)/)
assert.match(roles,/\.eq\('run_id',run\.id\)/)
assert.match(team,/v_current_player_cards[\s\S]*\.eq\('run_id',run\.id\)/)
assert.match(matches,/getPlayersWithProjection\(\)/)
assert.doesNotMatch(matches,/scout_player_projections/)
assert.match(recommendation,/select\('player_id,xfp,p90'\)/)
assert.match(recommendation,/xfp:Number\(projMap\.get\(m\.player_id\)\?\.xfp\?\?m\.xfp\?\?0\)/)

assert.match(data,/getHomeOverview=cache\(_getHomeOverview\)/)
assert.match(data,/getSquadPlayerPool=cache\(_getSquadPlayerPool\)/)
assert.match(data,/squad-player-pool-v1/)
assert.match(squadPool,/select\(SQUAD_POOL_COLUMNS\)/)
assert.doesNotMatch(squadPool,/select\('\*'\)/)

assert.match(home,/import \\{[^}]*getAuthState[^}]*getHomeOverview[^}]*\\} from '@\\/lib\\/data'/)
assert.match(home,/getHomeOverview\(\)/)
assert.match(home,/getAuthState\(\)/)
assert.doesNotMatch(home,/getPlayersWithProjection|getMatches\(/)

assert.match(squad,/getSquadPlayerPool/)
assert.doesNotMatch(squad,/getPlayersWithProjection/)
assert.match(squad,/scout_my_squad_page/)
assert.doesNotMatch(squad,/scout_user_squad_snapshots[\s\S]*\.limit\(34\)/)

console.log('current-run alignment and hot-path contract ok')
