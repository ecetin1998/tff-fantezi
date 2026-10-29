import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {draftFormationOptions,draftProjectedPoints} from '../lib/draftLineupForecast.js'

const sql=readFileSync('supabase/migrations/20261029123000_draft_club_limit_every_pick.sql','utf8')
const room=readFileSync('components/DraftRoom.js','utf8')
const ui=readFileSync('components/DraftLineupSetup.js','utf8')
const css=readFileSync('components/DraftLineupSetup.module.css','utf8')
const required={GK:2,DEF:5,MID:5,FWD:3}
const formations=['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1']
const maps=Object.fromEntries(formations.map(key=>{
 const [DEF,MID,FWD]=key.split('-').map(Number)
 return[key,{DEF,MID,FWD}]
}))
const values={GK:[4,3],DEF:[5,4,3,2,1],MID:[6,5,4,3,2],FWD:[7,6,1]}
let id=0
const roster=Object.entries(required).flatMap(([position,count])=>
 Array.from({length:count},(_,index)=>({id:++id,position,xfp:values[position][index]})))

test('SQL trigger protects every draft pick mutation and locks the room to prevent race conditions',()=>{
 assert.match(sql,/create or replace function public\.scout_draft_check_club_cap/)
 assert.match(sql,/for update;/)
 assert.match(sql,/already_owned>=3 then raise exception 'CLUB_LIMIT_REACHED'/)
 assert.match(sql,/p\.room_id=new\.room_id and p\.team_id=new\.team_id/)
 assert.match(sql,/p\.id is distinct from new\.id/)
 assert.match(sql,/before insert or update of player_id,team_id,room_id on public\.scout_draft_picks/)
 assert.doesNotMatch(sql,/delete from public\.scout_draft_picks/)
})
test('manual classic, timeout autopick, auction bid, completion and bot cannot take a fourth club player',()=>{
 for(const f of ['scout_draft_pick','scout_draft_classic_advance','scout_draft_auction_nominate','scout_draft_auction_bid','scout_draft_auction_complete_pick','scout_draft_auction_advance','scout_draft_bot_advance'])
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+f+'\\('))
 assert.match(sql,/and existing_sp\.team_id=\(select new_sp\.team_id/)
 assert.match(sql,/club_sp\.team_id=sp\.team_id/)
 assert.match(sql,/club_sp\.team_id=selected\.team_id/)
 assert.match(sql,/club_sp\.team_id=\(select candidate_sp\.team_id/)
 assert.match(sql,/club_sp\.team_id=\(select selected_sp\.team_id/)
 assert.ok((sql.match(/club_sp\.team_id=sp\.team_id/g)||[]).length>=5)
 assert.ok((sql.match(/CLUB_LIMIT_REACHED/g)||[]).length>=4)
})
test('draft screen filters full clubs, blocks bid and reports a clear error',()=>{
 assert.match(room,/CLUB_LIMIT_REACHED:'Aynı kulüpten en fazla 3 futbolcu seçebilirsin.'/)
 assert.match(room,/const clubCount=/)
 assert.match(room,/clubCount\(own,lot\.team\)<3/)
 assert.match(room,/clubCount\(current,p\.team\)<3/)
 assert.match(room,/clubCount\(own,p\.team\)<3/)
 assert.match(room,/teams\.some\(t=>t\.selections\.length<15/)
 assert.match(room,/disabled=\{!canChoose\|\|busy\|\|!selectedValid\}/)
 assert.match(room,/Kulüp sınırı: 3 futbolcu/)
})
test('fixed 15-player squads support all eight valid XI tactical formations',()=>{
 const options=draftFormationOptions(roster,maps)
 assert.equal(options.length,8)
 assert.deepEqual(new Set(options.map(x=>x.formation)),new Set(formations))
 for(const option of options){
  assert.equal(option.starters.length,11)
  assert.equal(option.bench.length,4)
  assert.equal(new Set([...option.starters,...option.bench]).size,15)
  assert.equal(roster.find(p=>p.id===option.bench[0]).position,'GK')
  assert.ok(option.starters.includes(option.captain))
  const counts=Object.fromEntries(Object.keys(required).map(position=>[position,
   option.starters.filter(id=>roster.find(p=>p.id===id).position===position).length]))
  assert.equal(counts.GK,1)
  assert.equal([counts.DEF,counts.MID,counts.FWD].join('-'),option.formation)
 }
 for(let i=1;i<options.length;i++)assert.ok(options[i-1].base>=options[i].base)
})
test('card forecasts include captain 2x/3x/4x and the full bench without changing squad',()=>{
 const byId=new Map(roster.map(p=>[p.id,p]))
 const best=draftFormationOptions(roster,maps)[0]
 const input=[best.starters,best.bench,best.captain]
 const base=draftProjectedPoints(...input,'none',byId)
 const captainScore=byId.get(best.captain).xfp
 assert.equal(draftProjectedPoints(...input,'triple_captain',byId),base+captainScore)
 assert.equal(draftProjectedPoints(...input,'quad_captain',byId),base+captainScore*2)
 assert.equal(draftProjectedPoints(...input,'bench_boost',byId),
  base+best.bench.reduce((total,id)=>total+byId.get(id).xfp,0))
 assert.equal(draftProjectedPoints(...input,'attack',byId),base) // unsupported in fixed draft
})
test('manager cards and optimized formation estimates shown before XI editor',()=>{
 assert.match(ui,/draftFormationOptions\(roster,FORMATION_MAP\)/)
 assert.match(ui,/draftProjectedPoints\(/)
 assert.match(ui,/formationOptions\.map/)
 assert.match(ui,/selectFormation\(option\)/)
 assert.match(ui,/Menajer kartı seç/)
 assert.match(ui,/Bu draftta yok/)
 assert.match(ui,/supportedCards=new Set/)
 assert.match(ui,/!supported/)
 assert.match(ui,/Kaptan 3×/)
 assert.match(ui,/Kaptan 4×/)
 assert.match(ui,/15 oyuncu puanda/)
 assert.match(ui,/Kadroya uygula/)
 assert.match(css,/\.formationGrid/)
 assert.match(css,/\.forecastSummary/)
 assert.match(css,/\.cardDisabled/)
})
