import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {teamEloFromClosed,teamEloMatchFactor,TEAM_ELO_POLICY} from '../supabase/functions/weekly-model-lifecycle/teamElo.mjs'
const source=JSON.parse(readFileSync(new URL('../data/source-evidence/mh1-11-closed-fixtures-frozen-elo-holdout.json',import.meta.url),'utf8'))
const games=source.rows
const fact=k=>{let s=0;for(let i=2;i<=k;i++)s+=Math.log(i);return s}
const nll=(goals,lambda)=>lambda-goals*Math.log(lambda)+fact(goals)
const weekLoss=(gw,withElo)=>{
 const target=games.filter(x=>Number(x.gameweek)===gw)
 const cutoff=target.map(x=>new Date(x.kickoff_at).getTime()).sort((a,b)=>a-b)[0]
 if(target.length!==9)throw Error('missing holdout week '+gw)
 const weekKickoff=new Date(cutoff).toISOString()
 return target.reduce((sum,m)=>{
   if(!m.frozen_run||!(new Date(m.frozen_at).getTime()<cutoff))throw Error('not frozen before FIRST kickoff')
   const factor=withElo?teamEloMatchFactor({
      homeId:m.home_team_id,awayId:m.away_team_id,history:games,
      targetWeek:gw,cutoffAt:weekKickoff,
      homeLambda:m.home_xg,awayLambda:m.away_xg
   }):{homeLambda:Number(m.home_xg),awayLambda:Number(m.away_xg)}
   if(withElo)assert.equal(factor.applied,true)
   return sum+nll(m.home_goals,factor.homeLambda)+nll(m.away_goals,factor.awayLambda)
 },0)/target.length
}
test('closed sources + all 45 frozen baselines predate their week FIRST kickoff',()=>{
 assert.equal(source.closed_matches,99)
 assert.equal(source.pre_kickoff_frozen_matches,45)
 for(let gw=7;gw<=11;gw++)assert.equal(games.filter(x=>x.gameweek===gw).length,9)
})
test('team Elo improves pre-kickoff frozen Poisson NLL in independent MH10 AND MH11',()=>{
 assert.equal(TEAM_ELO_POLICY,'team-elo-v1-frozen-MH7-9-train-MH10-11-holdout')
 for(const week of [7,8,9,10,11]){
  const base=weekLoss(week,false),trial=weekLoss(week,true)
  assert.ok(trial<base,`MH${week} Elo NLL ${trial} must improve baseline ${base}`)
 }
})
test('future week results and intra-week kickoff outcomes never change frozen Elo',()=>{
 const target=games.filter(g=>g.gameweek===10),first=new Date(Math.min(...target.map(x=>new Date(x.kickoff_at).getTime()))).toISOString()
 const a=teamEloFromClosed(games,{targetWeek:10,cutoffAt:first})
 const modified=games.map(g=>g.gameweek>=10?{...g,home_goals:99,away_goals:0}:g)
 const b=teamEloFromClosed(modified,{targetWeek:10,cutoffAt:first})
 assert.deepEqual(a.ratings,b.ratings)
 assert.equal(a.matches,81)
})
test('Elo adjustment capped, not a hidden 50% model rewrite',()=>{
 const team=teamEloMatchFactor({homeId:1,awayId:2,history:games,targetWeek:12,
   cutoffAt:'2026-11-21T10:30:00Z',homeLambda:1.5,awayLambda:1.4})
 assert.ok(team.applied)
 assert.ok(Math.abs(team.shift)<=.12+1e-12)
 assert.ok(Math.abs(Math.log(team.homeLambda/1.5))<=.12+1e-12)
})
