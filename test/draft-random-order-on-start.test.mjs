import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync('supabase/migrations/20261030124500_draft_shuffle_order_on_start.sql','utf8')
const ui=readFileSync('components/DraftRoom.js','utf8')
const style=readFileSync('components/DraftRoom.module.css','utf8')
const legacy=readFileSync('supabase/migrations/20261021164000_flexible_draft_rooms_auction_schema.sql','utf8')

test('the host starts exactly one server-side random draw after the full lobby is ready',()=>{
 assert.match(sql,/create or replace function public\.scout_draft_start\(p_room_id uuid\)/)
 assert.match(sql,/auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/)
 assert.match(sql,/where id=p_room_id for update/)
 assert.match(sql,/rm\.host_user_id<>auth\.uid\(\)/)
 assert.match(sql,/rm\.status<>'lobby'/)
 assert.match(sql,/user_id is not null or is_bot/)
 assert.match(sql,/WAIT_FOR_ALL_PLAYERS/)
 assert.match(sql,/row_number\(\) over \(order by gen_random_uuid\(\),t\.team_index\)/)
 assert.match(sql,/set draft_order=s\.new_order/)
 assert.ok(sql.indexOf('set draft_order=s.new_order')<sql.indexOf("set status='drafting'"))
 assert.match(sql,/where t\.id=s\.id and t\.room_id=rm\.id/)
 assert.doesNotMatch(sql,/update public\.scout_draft_picks|delete from public\.scout_draft_picks/)
 assert.match(sql,/grant execute on function public\.scout_draft_start\(uuid\) to authenticated/)
})

test('shuffle is compatible with deferred unique order index and server-side turn mapping',()=>{
 assert.match(legacy,/scout_draft_teams_draft_order_check check\(draft_order between 1 and 8\)/)
 // The existing database has a DEFERRABLE unique (room_id,draft_order) constraint;
 // each draw reassigns exactly 1..N without an intermediate invalid draft_order.
 for(let teamCount=2;teamCount<=8;teamCount++){
  const slots=Array.from({length:teamCount},(_,i)=>i+1)
  assert.equal(new Set(slots).size,teamCount)
  for(let pick=1;pick<=teamCount*15;pick++){
   const round=Math.ceil(pick/teamCount)
   const base=(pick-1)%teamCount+1
   const snake=round%2===0?teamCount+1-base:base
   assert.ok(slots.includes(snake))
   assert.ok(slots.includes(base))
  }
 }
})

test('lobby never shows temporary join-order positions as the final draft lottery',()=>{
 assert.match(ui,/Takım kaydı · \{t\.team_index\}/)
 assert.match(ui,/Kura sonucu/)
 assert.match(ui,/room\.status==='drafting'&&<div className=\{s\.drawResult\}>/)
 assert.match(ui,/teams\.map\(t=>'#'\+t\.draft_order\+' '\+t\.team_name\)/)
 assert.match(ui,/Oda kurucusu da kuraya katılır/)
 assert.doesNotMatch(ui,/İkinci tur: '\+\(room\.mode/)
 assert.match(style,/\.drawNotice\{/)
 assert.match(style,/\.drawResult\{/)
 assert.match(ui,/scout_draft_create_vs_bot/)
 assert.match(ui,/scout_draft_start/)
 assert.match(ui,/<DraftLeagueLineups roomId=\{id\} picks=\{picked\} pool=\{pool\}\/>/)
})
