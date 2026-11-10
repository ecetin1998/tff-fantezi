import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {verifiedLineupFormations as calibrate} from '../supabase/functions/weekly-model-lifecycle/verifiedLineupFormations.mjs'
const kickoff="2026-11-21T10:30:00Z"
const make=(week,team,offset,formation,at="2026-11-09T12:00:00Z")=>{
  const players=[],evidence=[],matches=[{match_id:300+week,gameweek:week,home_team_id:team,away_team_id:100,match_status:"Bitti",kickoff_at:week===11?"2026-11-08T11:00:00Z":"2026-11-01T11:00:00Z"}]
  for(const [pos,count] of Object.entries(formation))for(let i=0;i<count;i++){
    const id=offset++,pid={id,team_id:team,position:pos}
    players.push(pid)
    evidence.push({player_id:id,gameweek:week,match_id:300+week,started:true,
      verified_first_11:true,updated_at:at,source_url:"https://www.tff.org/fixture"})
  }
  return {players,evidence,matches}
}
const base={"4":{GK:1,DEF:4,MID:4,FWD:2},"10":{GK:1,DEF:4,MID:5,FWD:1}}
const a=make(10,4,1000,{GK:1,DEF:3,MID:6,FWD:1})
const b=make(11,4,2000,{GK:1,DEF:3,MID:6,FWD:1})
const input={targetWeek:12,cutoffAt:kickoff,baseFormations:base,
  players:[...a.players,...b.players],evidence:[...a.evidence,...b.evidence],matches:[...a.matches,...b.matches]}
test('Kocaelispor: both verified XIs override the stale 2-FWD quota',()=>{
 const x=calibrate(input)
 assert.deepEqual(x.formations["4"],{GK:1,DEF:3,MID:6,FWD:1})
 assert.equal(x.changed_teams.length,1)
 assert.deepEqual(base["4"],{GK:1,DEF:4,MID:4,FWD:2},'original unchanged')
})
test('does not infer changes from a single XI or an incomplete 10-player XI',()=>{
 const missing=calibrate({...input,evidence:input.evidence.filter(r=>r.gameweek!==10)})
 assert.deepEqual(missing.formations,base)
 const partial=calibrate({...input,evidence:input.evidence.filter(r=>r.gameweek!==11||r.player_id!==b.players[0].id)})
 assert.deepEqual(partial.formations,base)
})
test('future, post-kickoff, unverified and foreign-team records cannot shape lineups',()=>{
 for(const altered of [
  {...b.evidence[0],updated_at:"2026-11-22T00:00:00Z"},
  {...b.evidence[0],verified_first_11:false},
  {...b.evidence[0],source_url:null}
 ]){
  const x=calibrate({...input,evidence:[...a.evidence,...b.evidence.slice(1),altered]})
  assert.deepEqual(x.formations,base)
 }
 const unclosed=calibrate({...input,matches:input.matches.map(m=>m.gameweek===11?{...m,match_status:"Planlandı"}:m)})
 assert.deepEqual(unclosed.formations,base)
})
test('different last-two XIs do not create arbitrary toggling',()=>{
 const changed={...input,evidence:input.evidence.filter(r=>r.gameweek!==10),
  players:[...input.players],matches:input.matches}
 const replacement=make(10,4,3000,{GK:1,DEF:4,MID:5,FWD:1})
 changed.players.push(...replacement.players)
 changed.evidence.push(...replacement.evidence)
 assert.deepEqual(calibrate(changed).formations,base)
})
test('both weekly prepare and current refresh must call the source-gated selector',()=>{
 const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
 assert.match(worker,/verifiedLineupFormations\(/)
 assert.equal((worker.match(/fetchVerifiedTeamFormations\(/g)||[]).length>=3,true)
 assert.match(worker,/team_formations:verifiedFormations\.formations/)
 assert.match(worker,/verified_formations_v1/)
})

test('auditing an unpublished MH12 run refuses stale formation metadata even with matching code SHA',()=>{
 const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
 assert.match(worker,/SOURCE_VERIFIED_FORMATION_INPUT_PROVENANCE_MISSING/)
 assert.match(worker,/gw>=12&&run\.is_current!==true/)
 assert.match(worker,/Array\.isArray\(meta\.data\?\.lineup_factors\?\.verified_formations_v1\)/)
 assert.match(worker,/select\("own_goal_fraction,lineup_factors"\)/)
})
