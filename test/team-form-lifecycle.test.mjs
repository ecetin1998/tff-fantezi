import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {applyTeamMatchForm,recentTeamForm,auditMatchAllocation} from "../supabase/functions/weekly-model-lifecycle/teamRecentForm.mjs"

const historical=[]
for(let week=1;week<=8;week++){
  historical.push({gameweek:week,home_team_id:1,away_team_id:2,
    home_goals:week>=6?3:1,away_goals:week>=6?0:1,
    match_status:"Bitti",fantasy_closure:"KAPANDI"})
}
test("recent scoring/conceding last three + season shrink affects only goal environment",()=>{
  const home=recentTeamForm({teamId:1,gameweek:9,matches:historical})
  assert.equal(home.ready,true)
  assert.deepEqual(home.scoreWeeks,[6,7,8])
  assert.ok(home.gfRatio>1)
  assert.ok(home.gaRatio<1)
  const future=applyTeamMatchForm({
    baselineHome:1.5,baselineAway:1.1,homeTeamId:1,awayTeamId:2,
    gameweek:9,matches:historical
  })
  assert.equal(future.applied,true)
  assert.ok(future.homeLambda>1.5)
  assert.ok(future.awayLambda<1.1)
  assert.ok(future.homeLambda/1.5<=1.07)
  assert.ok(future.awayLambda/1.1>=.93)
  assert.ok(Math.exp(-future.awayLambda)>Math.exp(-1.1))
})
test("do not use current/future week or incomplete, unverified fixtures",()=>{
  const future=[...historical,{...historical[7],gameweek:9,home_goals:8,away_goals:8}]
  assert.deepEqual(
    recentTeamForm({teamId:1,gameweek:9,matches:future}),
    recentTeamForm({teamId:1,gameweek:9,matches:historical})
  )
  const bad=historical.map(x=>x.gameweek===8?{...x,fantasy_closure:"BEKLİYOR"}:x)
  assert.equal(recentTeamForm({teamId:1,gameweek:9,matches:bad}).ready,false)
  const noData=applyTeamMatchForm({baselineHome:1.5,baselineAway:1.1,homeTeamId:1,awayTeamId:3,gameweek:9,matches:historical})
  assert.equal(noData.applied,false)
  assert.equal(noData.homeLambda,1.5)
  assert.equal(noData.awayLambda,1.1)
})
function fixtureData(){
  const fixtures=Array.from({length:9},(_,i)=>({match_id:i+1,home_team_id:i*2+1,away_team_id:i*2+2}))
  const matchInputs=fixtures.map(x=>({...x,home_lambda:1.4,away_lambda:1.2}))
  const players=Array.from({length:456},(_,i)=>({player_id:i+1,club_id:i%18+1,position:i%10===0?"GK":i%3===0?"DEF":i%3===1?"MID":"FWD",rates:Array(12).fill(.1),availability:1}))
  const grouped=new Map()
  for(const p of players){if(!grouped.has(p.club_id))grouped.set(p.club_id,[]);grouped.get(p.club_id).push(p)}
  const shares=players.map(p=>({
    player_id:p.player_id,team_goal_share:1/grouped.get(p.club_id).length,
    team_assist_share:1/grouped.get(p.club_id).length
  }))
  return {gameweek:9,fixtures,matchInputs,playerInputs:players,roleShares:shares}
}
test("audits 9 matches 18 opponents 456 players and normalized goal/assist distribution",()=>{
  assert.equal(auditMatchAllocation(fixtureData()).pass,true)
  const bad=fixtureData()
  bad.matchInputs[0].away_lambda=-1
  bad.roleShares[0].team_assist_share=.999
  const qa=auditMatchAllocation(bad)
  assert.equal(qa.pass,false)
  assert.ok(qa.failures.includes("INVALID_MATCH_LAMBDA_OR_ID"))
  assert.ok(qa.failures.some(x=>x.includes("UNNORMALIZED_team_assist_share")))
})
test("duplicate fixture team and corrupt role/attack rate fail gate",()=>{
  const bad=fixtureData()
  bad.fixtures[0].away_team_id=bad.fixtures[1].away_team_id
  bad.playerInputs[0].rates[0]=-3
  const res=auditMatchAllocation(bad)
  assert.equal(res.pass,false)
  assert.ok(res.failures.includes("DUPLICATE_OR_SELF_TEAM_FIXTURE"))
  assert.ok(res.failures.includes("INVALID_PLAYER_ATTACK_RATE"))
})
test("lifecycle checks form from verified historical weeks and never fakes side weaknesses",()=>{
  const code=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  assert.match(code,/applyTeamMatchForm\(/)
  assert.match(code,/auditMatchAllocation\(/)
  assert.match(code,/verified-team-form-v1/)
  assert.match(code,/stableMatchesQ/)
  assert.match(code,/\["scout_match_predictions",matchPredictions\]/)
  assert.doesNotMatch(code,/inferred_conceded_left_share/)
})
