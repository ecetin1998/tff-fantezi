import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=JSON.parse(readFileSync(new URL('../data/source-evidence/gw8-11-verified-team-match-advanced.json',import.meta.url),'utf8'))
test('36 provider fixtures, four consecutive complete weeks and one match per team',()=>{
 assert.equal(source.safe_for_review,true)
 assert.equal(source.matches,36)
 assert.deepEqual(source.failures,[])
 assert.equal(source.no_db_writes,true)
 assert.equal(source.no_fantasy_writes,true)
 const pairs=new Map()
 for(const row of source.rows){
  assert.ok(row.gameweek>=8&&row.gameweek<=11)
  assert.ok(Number.isFinite(row.home_xg)&&row.home_xg>=0&&row.home_xg<=10)
  assert.ok(Number.isFinite(row.away_xg)&&row.away_xg>=0&&row.away_xg<=10)
  assert.ok(row.home_shots_on_target<=row.home_shots)
  assert.ok(row.away_shots_on_target<=row.away_shots)
  for(const id of [row.home_team_id,row.away_team_id]){
   const k=row.gameweek+':'+id
   assert.equal(pairs.has(k),false,'duplicate team per gameweek: '+k)
   pairs.set(k,row.match_id)
  }
 }
 assert.equal(pairs.size,72)
 assert.equal(new Set(source.rows.map(r=>r.match_id)).size,36)
})
test('separate source table cannot be accessed directly with anon or authenticated',()=>{
 const schema=readFileSync(new URL('../supabase/migrations/20261111022000_verified_team_match_advanced_mh8_11.sql',import.meta.url),'utf8')
 assert.match(schema,/enable row level security/)
 assert.match(schema,/revoke all on table public\.scout_verified_team_match_advanced from anon,authenticated/)
})
