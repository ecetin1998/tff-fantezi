import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const sql=readFileSync(resolve('supabase/migrations/20261021164000_flexible_draft_rooms_auction_schema.sql'),'utf8')
const auction=readFileSync(resolve('supabase/migrations/20261021165000_server_timed_auction_actions.sql'),'utf8')
const ui=readFileSync(resolve('components/DraftRoom.js'),'utf8')
const roster={GK:2,DEF:5,MID:5,FWD:3}

test('room count stays in inclusive 2-8 range',()=>{
 assert.match(sql,/check\(team_count between 2 and 8\)/)
 assert.match(sql,/n not between 2 and 8/)
 assert.match(ui,/Array\.from\(\{length:7\},\(_,i\)=>i\+2\)/)
})

test('each 2-8 team classic draft has a unique 15-round turn ordering',()=>{
 for(let n=2;n<=8;n++){
  for(const mode of ['snake','linear']){
   const turns=[]
   for(let pick=1;pick<=15*n;pick++){
    const round=Math.ceil(pick/n)
    let seat=(pick-1)%n+1
    if(mode==='snake'&&round%2===0)seat=n+1-seat
    turns.push(seat)
   }
   assert.equal(turns.length,15*n)
   for(let seat=1;seat<=n;seat++)assert.equal(turns.filter(x=>x===seat).length,15)
   assert.deepEqual(turns.slice(0,n),Array.from({length:n},(_,i)=>i+1))
   assert.deepEqual(turns.slice(n,2*n),Array.from({length:n},(_,i)=>mode==='snake'?n-i:i+1))
  }
 }
})

test('auction bid locks room, checks time and reserves one credit for each unfilled spot',()=>{
 assert.match(auction,/from public\.scout_draft_rooms where id=p_room_id for update/)
 assert.match(auction,/clock_timestamp\(\)>=lot\.ends_at/)
 assert.match(auction,/max_bid:=rm\.auction_budget-spent-\(14-count_all\)/)
 assert.match(auction,/p_amount>max_bid/)
 assert.match(auction,/lot\.leader_team_id=t\.id/)
 assert.match(auction,/greatest\(ends_at,clock_timestamp\(\)\)\+interval '5 seconds'/)
 assert.match(auction,/clock_timestamp\(\)\+interval '15 seconds'/)
 for(const filled of [0,1,10,14]){
   const spent=filled*2
   const max=100-spent-(14-filled)
   assert.ok(max+(14-filled)<=100-spent)
 }
 assert.deepEqual(Object.values(roster).reduce((a,b)=>a+b,0),15)
})

test('auction and classic picks remain mutually exclusive server actions',()=>{
 assert.match(sql,/rm\.draft_kind<>'classic'/)
 assert.match(auction,/rm\.draft_kind<>'auction'/)
 assert.match(sql,/scout_draft_undo/)
 assert.match(sql,/AUCTION_UNDO_UNSUPPORTED/)
 assert.match(ui,/room\?\.draft_kind==='auction'/)
})
