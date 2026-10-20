#!/usr/bin/env node
'use strict'
// Reproduces a 50K/50K MATCHED-SEED defender xA sensitivity analysis.
// NO DB WRITES, no model promotion, no official Fantasy score modification.
// Historical input: GW9 intraday source, intentionally includes NO proprietary
// production goal-distribution/shot-adjustment evidence. Differences are directional.
const fs=require('node:fs')
const path=require('node:path')
const {simulateScout}=require('../model/simulateScout')
const {inspectDefenderXa}=require('../model/defenderSourceQuality')

function replay({draws=50000,seed=20261021,inputPath}={}){
  if(!Number.isInteger(draws)||draws<1||draws>50000)throw Error('draws must be 1..50000')
  const filename=inputPath||path.join(__dirname,'../data/source-evidence/mh9-defender-xa-paired-input-20261021.json')
  const raw=JSON.parse(fs.readFileSync(filename,'utf8'))
  if(raw.kind!=='MH9_NON_PRODUCTION_DEFENDER_XA_DIAGNOSTIC'||
    raw.players?.length!==456||raw.matches?.length!==9||raw.gameweek!==9||
    raw.adjustments?.length!==2||raw.team_checks?.length!==18)
    throw Error('unexpected input identity: reject stale or partial evidence')
  const baseline=structuredClone(raw.players)
  const candidate=structuredClone(raw.players)
  const changes=[]
  for(const observed of raw.adjustments){
    const audit=inspectDefenderXa(observed)
    if(!audit.suspicious)throw Error('source is not demonstrably divergent: '+audit.player_id)
    const row=candidate.find(p=>p.id===audit.player_id)
    const before=baseline.find(p=>p.id===audit.player_id)
    if(!row||!before||row.pos!=='DEF'||row.sub_role!==audit.role||
       Math.abs(row.rates[3]-audit.source_xa90)>.000001)
      throw Error('simulation source did not reconcile for '+audit.player_id)
    row.rates[3]=audit.candidate_xa90
    changes.push({...audit,player_name:observed.player_name})
  }
  const args={matches:raw.matches,team_checks:raw.team_checks,
    temperature:raw.temperature,assist_fraction:raw.assist_fraction,
    own_fraction:raw.own_fraction,playerMatches:[]}
  const a=simulateScout({...args,players:baseline},draws,seed)
  const b=simulateScout({...args,players:candidate},draws,seed)
  const bm=new Map(b.map(x=>[x.id,x]))
  const rows=a.map(p=>{
    const right=bm.get(p.id)
    if(!right)throw Error('player lost in candidate: '+p.id)
    return {player_id:p.id,role:p.sub_role,position:p.pos,
      baseline_xfp:p.xfp,candidate_xfp:right.xfp,delta:right.xfp-p.xfp,
      baseline_xassist:p.xassist,candidate_xassist:right.xassist}
  })
  const targets=changes.map(x=>{
    const result=rows.find(r=>r.player_id===x.player_id)
    return {...x,...result}
  })
  if(rows.length!==456||targets.some(x=>x.delta>=0)||
      rows.some(x=>!Number.isFinite(x.delta)))throw Error('unexpected candidate score results')
  const roleGroups=Object.fromEntries(['CB','FB','WB'].map(role=>{
    const group=rows.filter(p=>p.role===role)
    const mean=(field)=>group.reduce((v,r)=>v+r[field],0)/group.length
    return [role,{players:group.length,baseline_mean_xfp:mean('baseline_xfp'),
      candidate_mean_xfp:mean('candidate_xfp'),mean_delta:mean('delta')}]
  }))
  return {status:'READ_ONLY_PAIRED_AUDIT_NOT_LIVE',production_equivalent:false,
    limitation:raw.caveat,season:raw.season,gameweek:raw.gameweek,
    source_run_id:raw.source_run_id,source_benchmark:raw.source_benchmark,
    seed,draws,players:rows.length,fixtures:raw.matches.length,
    targets,role_groups:roleGroups,
    changes_over_0_05:rows.filter(p=>Math.abs(p.delta)>=.05).length,
    top_movers:rows.slice().sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,16)}
}

if(require.main===module){
  const args=process.argv.slice(2)
  const get=(flag,defaultValue)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:defaultValue}
  const report=replay({draws:Number(get('--draws','50000')),
    seed:Number(get('--seed','20261021')),
    inputPath:get('--input',undefined)})
  const out=get('--out',undefined)
  if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n','utf8')
  console.log(JSON.stringify(report,null,2))
}
module.exports={replay}
