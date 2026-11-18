import test from 'node:test'
import assert from 'node:assert/strict'
import {captainOptions,rankSingleTransfers,risingPlayers,squadFragility} from '../lib/squadDecisionInsights.mjs'
import {readFileSync} from 'node:fs'

const squadPos=['GK','GK','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','FWD','FWD','FWD']
const pool=Array.from({length:15},(_,i)=>({
 id:i+1,active:true,position:squadPos[i],team_id:i%9+1,price:5,
 full_name:'Oyuncu '+(i+1),projection:{xfp:3,xi_probability:.9,x_minutes:80,availability_probability:1}
}))
const better={id:40,active:true,position:'DEF',team_id:9,price:5,
 full_name:'Yeni DEF',projection:{xfp:9,xi_probability:.95,x_minutes:85,availability_probability:1,p90:13}}
const risky={id:41,active:true,position:'DEF',team_id:9,price:5,
 full_name:'Riskli DEF',projection:{xfp:10,xi_probability:.22,x_minutes:22,availability_probability:1,p90:null}}
const map=new Map([...pool,better,risky].map(p=>[p.id,p]))
const ids=pool.map(p=>p.id)
const scorer=(list,{playerMap})=>({
 total:list.reduce((a,id)=>a+Number(playerMap.get(id)?.projection?.xfp||0),0),
 firstWeek:{lineup:[...list].slice(0,11),bench:list.slice(11),key:'4-3-3',captain:playerMap.get(list[2])}
})
test('risk report is diagnostic and requires eleven real players',()=>{
 assert.equal(squadFragility(ids.slice(0,10),map),null)
 const a=squadFragility(ids.slice(0,11),map)
 assert.equal(a.lowXI,0)
 assert.equal(a.lowMinutes,0)
 assert.equal(a.score>=0,true)
})
test('captain report compares existing XI without assigning points to missing values',()=>{
 const choices=captainOptions(ids.slice(0,11),3,map,2)
 assert.equal(choices.length,4)
 assert.equal(choices[0].gain,0)
 assert.equal(choices.every(x=>x.player.position!=='GK'),true)
})
test('breakout list uses observed two windows, never guessed zero for missing evidence',()=>{
 const candidates=[
  {...better,role_signal:{last2_minutes:72,previous2_minutes:40,last2_xi_probability:.9,previous2_xi_probability:.5}},
  {...risky,role_signal:{last2_minutes:74,previous2_minutes:null}},
 ]
 const r=risingPlayers(candidates,[],6)
 assert.deepEqual(r.map(x=>x.player.id),[40])
 assert.equal(r[0].change,32)
})
test('transfer shortlist respects budget, club, scoring, captain plan and free transfer',()=>{
 const moves=rankSingleTransfers({ids,pool:[...pool,better],playerMap:map,scoreFn:scorer,
   budget:100,freeRemaining:1,clubMax:3,maxResults:5})
 assert.equal(moves.length>0,true)
 assert.equal(moves[0].incoming.id,40)
 assert.equal(moves[0].hit,0)
 assert.equal(moves[0].net>0,true)
 assert.equal(moves[0].nextIds.length,15)
 assert.equal(moves[0].plan.lineup.length,11)
 const penalty=rankSingleTransfers({ids,pool:[...pool,better],playerMap:map,scoreFn:scorer,
   budget:100,freeRemaining:0,hitCost:8,clubMax:3})
 assert.deepEqual(penalty,[])
 const noBudget=rankSingleTransfers({ids,pool:[...pool,{...better,price:99}],playerMap:new Map([...pool,{...better,price:99}].map(p=>[p.id,p])),
   scoreFn:scorer,budget:100,freeRemaining:1})
 assert.deepEqual(noBudget,[])
})
test('ceiling mode fails closed when premium P90 evidence is missing',()=>{
 const lacking=rankSingleTransfers({ids,pool:[...pool,risky],playerMap:map,mode:'ceiling',scoreFn:scorer})
 assert.deepEqual(lacking,[])
})
test('UI remains current-run only, does not call save from recommendation, and Pro overlay is gated',()=>{
 const ui=readFileSync('components/SquadDecisionLab.js','utf8')
 const builder=readFileSync('components/SquadBuilder.js','utf8')
 const route=readFileSync('app/squad/page.js','utf8')
 assert.match(ui,/mode==='ceiling'/)
 assert.match(ui,/risingPlayers\(enriched,ids,6\)/)
 assert.match(ui,/rankSingleTransfers\(/)
 assert.match(ui,/initialCount===15/)
 assert.match(builder,/function applyDecisionTransfer\(move\)/)
 assert.match(builder,/onApply=\{applyDecisionTransfer\}/)
 assert.match(route,/auth\.plan==='pro'&&run\?\.id/)
 assert.match(route,/getProOverlayForRun\(run\.id\)/)
 assert.doesNotMatch(ui,/saveSquad/)
})
