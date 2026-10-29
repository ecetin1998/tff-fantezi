import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const migration=readFileSync('supabase/migrations/20261029130000_draft_enforce_three_per_club.sql','utf8')
const ui=readFileSync('components/DraftRoom.js','utf8')
const builder=readFileSync('components/DraftLineupSetup.js','utf8')
const formationSource=readFileSync('lib/draftFormationOptions.js','utf8')
const {rankDraftFormations}=await import('data:text/javascript;base64,'+Buffer.from(formationSource).toString('base64'))
const formats=Object.fromEntries(['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1'].map(k=>{
 const [DEF,MID,FWD]=k.split('-').map(Number)
 return [k,{DEF,MID,FWD}]
}))
const roster=[
 ...[4,3].map((xfp,i)=>({id:i+1,position:'GK',xfp})),
 ...[6,5,4,3,2].map((xfp,i)=>({id:i+3,position:'DEF',xfp})),
 ...[8,7,6,5,4].map((xfp,i)=>({id:i+8,position:'MID',xfp})),
 ...[9,8,6].map((xfp,i)=>({id:i+13,position:'FWD',xfp}))
]

test('draft pick database trigger rejects fourth same-club player regardless of caller',()=>{
 assert.match(migration,/create trigger scout_draft_club_limit_guard\s+before insert on public\.scout_draft_picks/)
 assert.match(migration,/returns boolean language sql volatile security definer/)
 assert.match(migration,/from public\.scout_draft_picks pk\s+join public\.scout_players owned/)
 assert.match(migration,/and owned\.team_id=p_club_id\s+\) < 3/)
 assert.match(migration,/raise exception 'CLUB_LIMIT_REACHED'/)
 assert.match(migration,/not exists\(select 1 from public\.scout_draft_teams t/)
 assert.doesNotMatch(migration,/delete from public\.scout_draft_picks/)
})

test('computer, automatic timeout and auction all filter unavailable clubs before picking',()=>{
 for(const name of [
  'scout_draft_classic_advance','scout_draft_bot_advance','scout_draft_auction_nominate',
  'scout_draft_auction_advance','scout_draft_auction_bid','scout_draft_auction_complete_pick'
 ]) assert.match(migration,new RegExp('-- '+name+'\\n'))
 assert.ok((migration.match(/private\.scout_draft_club_has_space\(/g)||[]).length>=11)
 assert.match(migration,/lot\.player_id/)
 assert.match(migration,/club_id\) then raise exception 'CLUB_LIMIT_REACHED'/)
 assert.match(migration,/select position,team_id into pos,club_id/)
 assert.match(ui,/MAX_PLAYERS_PER_CLUB/)
 assert.match(ui,/canAddClub\(own,lotPlayer\)/)
 assert.match(ui,/canAddClub\(current,p\)/)
 assert.match(ui,/canAddClub\(own,p\)/)
 assert.match(ui,/CLUB_LIMIT_REACHED/)
})

test('all eight legal lineups are ranked using only a 15-player draft roster',()=>{
 const plans=rankDraftFormations(roster,formats,'none')
 assert.equal(plans.length,8)
 assert.equal(new Set(plans.map(p=>p.key)).size,8)
 for(const plan of plans){
  assert.equal(plan.starters.length,11)
  assert.equal(plan.bench.length,4)
  assert.equal(new Set([...plan.starters,...plan.bench]).size,15)
  assert.equal(plan.bench[0],2)
  assert.ok(plan.starters.includes(plan.captain))
  assert.ok(plan.total>=plan.base)
 }
 assert.ok(plans.every((p,i)=>i===0||plans[i-1].total>=p.total))
})

test('captain and bench-boost manager cards adjust preview points like actual scoring',()=>{
 const normal=rankDraftFormations(roster,formats,'none')
 const triple=rankDraftFormations(roster,formats,'triple_captain')
 const quad=rankDraftFormations(roster,formats,'quad_captain')
 const boost=rankDraftFormations(roster,formats,'bench_boost')
 const key='3-4-3'
 const find=plans=>plans.find(p=>p.key===key)
 const base=find(normal),captainScore=roster.find(p=>p.id===base.captain).xfp
 assert.equal(find(triple).total-base.total,captainScore)
 assert.equal(find(quad).total-base.total,2*captainScore)
 const benchScore=find(normal).bench.reduce((sum,id)=>sum+roster.find(p=>p.id===id).xfp,0)
 assert.equal(find(boost).total-base.total,benchScore)
})

test('formation cards are selectable and reconfigure XI, bench and captain',()=>{
 assert.match(builder,/rankDraftFormations\(roster,FORMATION_MAP,card\)/)
 assert.match(builder,/formationPlans\.map\(/)
 assert.match(builder,/className=\{s\.formationOption/)
 assert.match(builder,/formationRecommended/)
 assert.match(builder,/applyFormation\(plan\)/)
 assert.match(builder,/setStarters\(\[\.\.\.plan\.starters\]\)/)
 assert.match(builder,/setBench\(\[\.\.\.plan\.bench\]\)/)
 assert.match(builder,/setCaptain\(plan\.captain\)/)
 assert.match(builder,/setDirty\(true\)/)
 assert.match(builder,/Kaptan dahil/)
})
