import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {twoWeekStarterContinuity} from '../supabase/functions/weekly-model-lifecycle/twoWeekStarterContinuity.mjs'

const fixture=JSON.parse(readFileSync(new URL('fixtures/p0-asof-xi-mh10-mh11.json',import.meta.url),'utf8'))
const POSITIONS=['GK','DEF','MID','FWD']
const N=50000
const SEED=0x20a4b1cf
function rng(seed){
 let state=seed>>>0
 return()=>{
  state=(state+0x6D2B79F5)>>>0
  let t=state
  t=Math.imul(t^(t>>>15),t|1)
  t^=t+Math.imul(t^(t>>>7),t|61)
  return ((t^(t>>>14))>>>0)/4294967296
 }
}
function drawTeam(players,formation,random,calibrated){
 const active=new Set()
 for(const p of players)if(random()<p.avail)active.add(p.id)
 const starters=new Set(),used=new Set(),minutes=new Map(),exits=[]
 for(const pos of POSITIONS){
  const count=Number(formation[pos]||0)
  if(!count)continue
  const matching=players.filter(p=>p.pos===pos)
  if(matching.filter(p=>active.has(p.id)).length<count)
   for(const p of matching)if(p.avail>0)active.add(p.id)
  const candidates=matching.filter(p=>active.has(p.id)).map(p=>{
   const value=calibrated?p.calibratedRole:p.role
   return {p,key:Math.log(value/(1-value))/1.7-
      Math.log(-Math.log(Math.max(1e-12,random())))}
  }).sort((a,b)=>b.key-a.key)
  assert.ok(candidates.length>=count,'pre-kickoff registered-position roster is insufficient')
  for(const {p} of candidates.slice(0,count)){
   used.add(p.id);starters.add(p.id)
   let duration=90
   if(pos!=='GK'){
    let z=random()
    duration=p.durations[p.durations.length-1]??90
    for(let j=0;j<p.durations.length;j++){
     z-=p.weights[j]
     if(z<=0){duration=p.durations[j];break}
    }
   }
   duration=Math.trunc(duration)
   exits.push({p,duration})
   minutes.set(p.id,duration)
  }
 }
 let substitutes=0
 for(const {p,duration} of exits.sort((a,b)=>a.duration-b.duration)){
  if(duration>=90)continue
  const eligible=players.filter(x=>active.has(x.id)&&!used.has(x.id)&&x.pos===p.pos&&x.pos!=='GK')
  if(substitutes>=5||!eligible.length){minutes.set(p.id,90);continue}
  const total=eligible.reduce((sum,x)=>sum+Math.max(0,x.bench),0)
  let selected=eligible[eligible.length-1]
  if(total<=0)selected=eligible[Math.floor(random()*eligible.length)]
  else{
   let z=random()*total
   for(const option of eligible){
    z-=Math.max(0,option.bench)
    if(z<=0){selected=option;break}
   }
  }
  used.add(selected.id)
  minutes.set(selected.id,90-duration)
  substitutes++
 }
 assert.equal(starters.size,11,'11 registered starters')
 assert.equal([...minutes.values()].reduce((sum,v)=>sum+v,0),990,'990 team minutes')
 return {starters,minutes}
}
function replay(week){
 const frozen=Date.parse(week.snapshot_at),kickoff=Date.parse(week.kickoff)
 assert.ok(Date.parse(week.meta_at)<frozen&&frozen<kickoff,'two immutable pre-kickoff source clocks')
 const groups=new Map()
 let eligible=0
 for(const player of week.players){
  assert.ok(Date.parse(player.input_at)<frozen,'all role weights archived before freeze')
  const obs=[player.one,player.two].filter(Boolean)
  const continuity=twoWeekStarterContinuity({
   baseline:player.role,position:player.pos,
   weekly:obs,targetWeek:week.gameweek,cutoffAt:week.snapshot_at,
   availability:player.avail
  })
  if(continuity.applied)eligible++
  const copy={...player,calibratedRole:continuity.role}
  if(!groups.has(player.club))groups.set(player.club,[])
  groups.get(player.club).push(copy)
 }
 const sum={base:new Map(),trial:new Map()}
 for(const p of week.players){
  sum.base.set(p.id,{xi:0,minutes:0})
  sum.trial.set(p.id,{xi:0,minutes:0})
 }
 for(const [club,players] of groups){
  const quota=week.formations[String(club)]
  assert.ok(quota,'historical registered XI quota exists')
  assert.equal(POSITIONS.reduce((a,pos)=>a+Number(quota[pos]||0),0),11)
  for(let i=0;i<N;i++){
   const seed=(SEED^Math.imul(week.gameweek,0x45d9f3b)^
     Math.imul(club,0x27d4eb2d)^Math.imul(i+1,0x165667b1))>>>0
   const initial=drawTeam(players,quota,rng(seed),false)
   const challenger=drawTeam(players,quota,rng(seed),true)
   for(const p of players){
    const a=sum.base.get(p.id),b=sum.trial.get(p.id)
    a.xi+=Number(initial.starters.has(p.id))
    a.minutes+=initial.minutes.get(p.id)||0
    b.xi+=Number(challenger.starters.has(p.id))
    b.minutes+=challenger.minutes.get(p.id)||0
   }
  }
 }
 let n=0,verified=0,exante=0
 let baseBrier=0,trialBrier=0,baseMAE=0,trialMAE=0,
  baseEx=0,trialEx=0
 for(const player of week.players){
  const a=sum.base.get(player.id),b=sum.trial.get(player.id)
  const oldProb=a.xi/N,newProb=b.xi/N
  const oldMin=a.minutes/N,newMin=b.minutes/N
  baseBrier+=(oldProb-player.label.xi)**2
  trialBrier+=(newProb-player.label.xi)**2
  n++
  if(player.label.minutes!==null){
   verified++
   baseMAE+=Math.abs(oldMin-player.label.minutes)
   trialMAE+=Math.abs(newMin-player.label.minutes)
   if(oldMin>=30){
    exante++
    baseEx+=Math.abs(oldMin-player.label.minutes)
    trialEx+=Math.abs(newMin-player.label.minutes)
   }
  }
 }
 const round=x=>Math.round(x*100000)/100000
 return {gameweek:week.gameweek,draws:N,players:n,eligible,
  verified_minutes:verified,ex_ante_30:exante,
  champion_brier:round(baseBrier/n),challenger_brier:round(trialBrier/n),
  champion_minute_mae:round(baseMAE/verified),challenger_minute_mae:round(trialMAE/verified),
  champion_exante_mae:round(baseEx/exante),challenger_exante_mae:round(trialEx/exante)}
}
test('MH10 and MH11 independent as-of snapshots improve XI and minute MAE with matched 50K team draws',()=>{
 const all=fixture.weeks.map(replay)
 for(const r of all){
  console.log('P0 frozen replay:',JSON.stringify(r))
  assert.equal(r.draws,50000)
  assert.ok(r.players>=400&&r.eligible>0&&r.ex_ante_30>100)
  assert.ok(r.challenger_brier<r.champion_brier,
   'source-backed starter XI improvement required in week '+r.gameweek)
  assert.ok(r.challenger_minute_mae<=r.champion_minute_mae,
   'all source-verified playing-time MAE must not regress in week '+r.gameweek)
  assert.ok(r.challenger_exante_mae<=r.champion_exante_mae,
   'ex-ante 30+ minute MAE must not regress in week '+r.gameweek)
 }
})
