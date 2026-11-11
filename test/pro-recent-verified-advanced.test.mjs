import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const root=rel=>readFileSync(new URL('../'+rel,import.meta.url),'utf8')
test('Pro-only observed advanced data is separate from old cumulative stats',()=>{
 const data=root('lib/data.js'),player=root('app/players/[id]/page.js'),team=root('app/teams/[id]/page.js')
 assert.match(data,/scout_pro_player_recent_advanced/)
 assert.match(data,/scout_pro_team_recent_advanced/)
 assert.match(player,/advancedRecent=pro\?\.advancedRecent/)
 assert.match(player,/value===null\|\|value===undefined\?'—'/)
 assert.match(player,/0 dakika kayıtları kaynakla doğrulanmadan/)
 assert.match(team,/recentMatches===4/)
 assert.match(team,/son dört maç/i)
 assert.match(team,/Ayrıntılı olay MH/)
})
test('RPCs require real active Pro and never grant anonymous execution',()=>{
 const sql=root('supabase/migrations/20261111023700_pro_recent_advanced_verified_player_team.sql')
 assert.equal((sql.match(/s\.plan='pro'/g)||[]).length,2)
 assert.equal((sql.match(/auth\.uid\(\)/g)||[]).length>=4,true)
 assert.equal((sql.match(/security definer set search_path=''/g)||[]).length,2)
 assert.equal((sql.match(/revoke all on function/g)||[]).length,2)
 assert.equal((sql.match(/grant execute on function/g)||[]).length,2)
 assert.match(sql,/w\.minutes>0/)
 assert.match(sql,/having count\(\*\)=4/)
})
