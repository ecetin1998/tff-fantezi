import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUD="tff-fantezi-scout"
const ISS="https://token.actions.githubusercontent.com"
const REPO="ecetin1998/tff-fantezi"
const REPO_ID="1353738004"
const JWKS="https://token.actions.githubusercontent.com/.well-known/jwks"
const SEASON="2026-27"

function part(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=");return JSON.parse(atob(p))}
function bytes(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"="),s=atob(p);return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function authorized(req:Request){
  const h=req.headers.get("authorization")||""
  if(!h.startsWith("Bearer "))return false
  try{
    const token=h.slice(7),parts=token.split(".")
    if(parts.length!==3)return false
    const head=part(parts[0]),p=part(parts[1]),now=Math.floor(Date.now()/1000)
    const aud=Array.isArray(p.aud)?p.aud.includes(AUD):p.aud===AUD
    if(head.alg!=="RS256"||!head.kid||p.iss!==ISS||!aud||p.repository_id!==REPO_ID||p.repository!==REPO||
       p.ref!=="refs/heads/main"||!["workflow_dispatch","schedule"].includes(String(p.event_name||""))||
       Number(p.exp||0)<now-30||Number(p.nbf||0)>now+30)return false
    const jwks=await fetch(JWKS).then(r=>r.json()),jwk=(jwks.keys||[]).find((k:any)=>k.kid===head.kid)
    if(!jwk)return false
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])
    return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,bytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]))
  }catch{return false}
}
function n(v:any,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v))}
function median(xs:number[]){if(!xs.length)return 1;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function isoCompact(v:string){return new Date(v).toISOString().replace(/[-:TZ.]/g,"").slice(0,12)}
function poissonPmf(k:number,lambda:number){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p}
function scoreModel(home:number,away:number){
  const cells:any[]=[];let homeWin=0,draw=0,awayWin=0,btts=0,o15=0,o25=0,o35=0,margin3=0
  for(let h=0;h<=8;h++)for(let a=0;a<=8;a++){
    const p=poissonPmf(h,home)*poissonPmf(a,away)
    cells.push({h,a,p})
    if(h>a)homeWin+=p;else if(h===a)draw+=p;else awayWin+=p
    if(h>0&&a>0)btts+=p
    if(h+a>=2)o15+=p;if(h+a>=3)o25+=p;if(h+a>=4)o35+=p
    if(Math.abs(h-a)>=3)margin3+=p
  }
  const z=homeWin+draw+awayWin||1
  cells.sort((x,y)=>y.p-x.p||x.h-y.h||x.a-y.a)
  return {
    home_win_probability:homeWin/z,draw_probability:draw/z,away_win_probability:awayWin/z,
    home_cs_probability:Math.exp(-away),away_cs_probability:Math.exp(-home),
    top_score:`${cells[0].h}-${cells[0].a}`,top_score_probability:cells[0].p,
    second_score:`${cells[1].h}-${cells[1].a}`,second_score_probability:cells[1].p,
    third_score:`${cells[2].h}-${cells[2].a}`,third_score_probability:cells[2].p,
    btts_probability:btts,over15_probability:o15,over25_probability:o25,over35_probability:o35,
    three_goal_margin_probability:margin3
  }
}
async function one(sb:any,table:string,select:string,filters:(q:any)=>any){
  const q=await filters(sb.from(table).select(select)).maybeSingle()
  if(q.error)throw q.error
  return q.data
}
async function lifecyclePatch(sb:any,target:number,patch:any){
  const existing=await one(sb,"scout_weekly_lifecycle","*",q=>q.eq("target_gameweek",target))
  const row={
    target_gameweek:target,
    source_gameweek:target-1,
    stage:existing?.stage||"waiting",
    status:existing?.status||"waiting",
    details:existing?.details||{},
    updated_at:new Date().toISOString(),
    ...existing,...patch
  }
  const q=await sb.from("scout_weekly_lifecycle").upsert(row,{onConflict:"target_gameweek"})
  if(q.error)throw q.error
}
async function context(sb:any){
  const current=await one(sb,"scout_model_runs","id,gameweek,model_version,generated_at,source_updated_at,status,is_current",q=>q.eq("is_current",true).eq("status","ready"))
  if(!current)throw new Error("CURRENT_RUN_MISSING")
  const sourceGw=Number(current.gameweek),targetGw=sourceGw+1
  if(targetGw>38)return {current,sourceGw,targetGw,seasonComplete:true}
  const closure=await sb.rpc("scout_week_closure_status",{p_gameweek:sourceGw})
  if(closure.error)throw closure.error
  const [targetFx,teamStats,playerStats,av,currentPred,currentMeta]=await Promise.all([
    sb.from("scout_match_history").select("*").eq("season",SEASON).eq("gameweek",targetGw).order("kickoff_at"),
    sb.from("scout_team_season_stats").select("team_id,through_gameweek,source_updated_at").eq("through_gameweek",sourceGw),
    sb.from("scout_player_season_stats").select("player_id,through_gameweek,updated_at").eq("season",SEASON).gte("through_gameweek",sourceGw),
    sb.from("scout_availability").select("checked_at").eq("run_id",current.id).order("checked_at",{ascending:true}).limit(1).maybeSingle(),
    sb.from("scout_match_predictions").select("match_id").eq("run_id",current.id),
    sb.from("scout_replay_input_meta").select("*").eq("gameweek",sourceGw).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ])
  for(const q of [targetFx,teamStats,playerStats,av,currentPred,currentMeta])if(q.error)throw q.error
  const activeQ=await sb.from("scout_players").select("id",{count:"exact",head:true}).eq("active",true)
  if(activeQ.error)throw activeQ.error
  const activeCount=activeQ.count||0
  const expectedMatches=(currentPred.data||[]).length||9
  const minAvail=av.data?.checked_at||null
  const availabilityFresh=minAvail?Date.now()-new Date(minAvail).getTime()<=24*3600*1000:false
  const sourceTimes=[
    ...(targetFx.data||[]).map((x:any)=>x.source_updated_at),
    ...(teamStats.data||[]).map((x:any)=>x.source_updated_at),
    ...(playerStats.data||[]).map((x:any)=>x.updated_at),
    minAvail
  ].filter(Boolean).map((x:any)=>new Date(x).getTime()).filter(Number.isFinite)
  const sourceStamp=new Date(sourceTimes.length?Math.max(...sourceTimes):Date.now()).toISOString()
  const reasons:string[]=[]
  if(!closure.data?.pass)reasons.push("source_gameweek_not_closed")
  if((targetFx.data||[]).length!==expectedMatches)reasons.push("target_fixtures_missing")
  if((teamStats.data||[]).length!==18)reasons.push("team_stats_not_through_source_week")
  if((playerStats.data||[]).length<activeCount)reasons.push("player_stats_not_through_source_week")
  if(!availabilityFresh)reasons.push("availability_stale")
  return {
    current,sourceGw,targetGw,seasonComplete:false,closure:closure.data,
    targetFixtureCount:(targetFx.data||[]).length,expectedMatches,
    teamStatsCount:(teamStats.data||[]).length,playerStatsCount:(playerStats.data||[]).length,activeCount,
    availabilityCheckedAt:minAvail,availabilityFresh,sourceStamp,
    ready:reasons.length===0,reasons,currentMeta:currentMeta.data
  }
}
async function prepare(sb:any,ctx:any){
  if(!ctx.ready)throw new Error("LIFECYCLE_NOT_READY:"+ctx.reasons.join(","))
  const sourceGw=ctx.sourceGw,targetGw=ctx.targetGw,current=ctx.current
  const refresh=await sb.rpc("scout_refresh_enrichment_profiles",{p_season:SEASON,p_through_gameweek:sourceGw})
  if(refresh.error)throw refresh.error

  const executionKey=`weekly-auto:mh${targetGw}:${isoCompact(ctx.sourceStamp)}`
  const benchmark=`live-mh${targetGw}-weekly-auto-v1-${isoCompact(ctx.sourceStamp)}`
  const existing=await one(sb,"scout_model_runs","id,gameweek,status,notes,source_updated_at",q=>
    q.eq("gameweek",targetGw).neq("is_current",true).ilike("notes",`%${executionKey}%`).order("generated_at",{ascending:false}).limit(1)
  )
  if(existing){
    await lifecyclePatch(sb,targetGw,{source_run_id:current.id,candidate_run_id:existing.id,benchmark_version:benchmark,execution_key:executionKey,stage:"prepared",status:"running",last_error:null})
    return {run_id:existing.id,gameweek:targetGw,benchmark,reused:true,execution_key:executionKey}
  }

  const oldAuto=await sb.from("scout_model_runs").select("id").eq("gameweek",targetGw).eq("is_current",false).ilike("notes","%weekly-auto:%")
  if(oldAuto.error)throw oldAuto.error
  if((oldAuto.data||[]).length){
    const ids=(oldAuto.data||[]).map((x:any)=>x.id)
    const arch=await sb.from("scout_model_runs").update({status:"archived"}).in("id",ids).eq("status","building")
    if(arch.error)throw arch.error
  }

  const runId=crypto.randomUUID()
  const now=new Date().toISOString()
  const insRun=await sb.from("scout_model_runs").insert({
    id:runId,gameweek:targetGw,model_version:`ScoutPlus 3.3 / MH${targetGw} • weekly-auto-v1`,
    generated_at:now,source_updated_at:ctx.sourceStamp,simulation_count:0,status:"building",is_current:false,
    notes:`${executionKey} • source MH${sourceGw} fully closed • fail-closed weekly lifecycle`
  })
  if(insRun.error)throw insRun.error

  const [playersQ,projQ,rolesQ,avQ,statsQ,weeklyQ,teamsQ,profilesQ,fxQ,prevInputsQ,prevMatchesQ,metaQ]=await Promise.all([
    sb.from("scout_players").select("id,full_name,team_id,position,price,active,primary_role,role_side").eq("active",true).order("id"),
    sb.from("scout_player_projections").select("*").eq("run_id",current.id),
    sb.from("scout_role_signals").select("*").eq("run_id",current.id),
    sb.from("scout_availability").select("*").eq("run_id",current.id),
    sb.from("scout_player_season_stats").select("*").eq("season",SEASON),
    sb.from("scout_player_weekly_points").select("player_id,gameweek,points,minutes").lt("gameweek",targetGw).eq("is_final",true).order("gameweek",{ascending:false}),
    sb.from("scout_teams").select("id,name"),
    sb.from("scout_team_tactical_profiles").select("*").eq("season",SEASON).eq("through_gameweek",sourceGw),
    sb.from("scout_match_history").select("*").eq("season",SEASON).eq("gameweek",targetGw).order("kickoff_at"),
    ctx.currentMeta?.benchmark_version
      ? sb.from("scout_replay_player_inputs").select("*").eq("gameweek",sourceGw).eq("benchmark_version",ctx.currentMeta.benchmark_version)
      : Promise.resolve({data:[],error:null}),
    sb.from("scout_match_predictions").select("*").eq("run_id",current.id),
    Promise.resolve({data:ctx.currentMeta,error:null}),
  ])
  for(const q of [playersQ,projQ,rolesQ,avQ,statsQ,weeklyQ,teamsQ,profilesQ,fxQ,prevInputsQ,prevMatchesQ])if(q.error)throw q.error

  const players=playersQ.data||[],projBy=new Map((projQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const roleBy=new Map((rolesQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const avBy=new Map((avQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const statBy=new Map((statsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const prevBy=new Map((prevInputsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const teamName=new Map((teamsQ.data||[]).map((x:any)=>[Number(x.id),x.name]))
  const profileBy=new Map((profilesQ.data||[]).map((x:any)=>[Number(x.team_id),x]))
  const fixtureByTeam=new Map<number,any>()
  for(const f of (fxQ.data||[])){
    fixtureByTeam.set(Number(f.home_team_id),{...f,venue:"HOME",opponent_name:f.away_team_name})
    fixtureByTeam.set(Number(f.away_team_id),{...f,venue:"AWAY",opponent_name:f.home_team_name})
  }
  const recentBy=new Map<number,any[]>()
  for(const w of (weeklyQ.data||[])){
    const id=Number(w.player_id),arr=recentBy.get(id)||[]
    if(arr.length<5)arr.push(w)
    recentBy.set(id,arr)
  }

  const currentProfilesBy=new Map(profileBy)
  const homeRatios:number[]=[],awayRatios:number[]=[]
  for(const m of (prevMatchesQ.data||[])){
    const hp=currentProfilesBy.get(Number(m.home_team_id)),ap=currentProfilesBy.get(Number(m.away_team_id))
    if(!hp||!ap)continue
    const hb=Math.sqrt(Math.max(.15,n(hp.attack_xg_per_match,1.3))*Math.max(.15,n(ap.defense_xga_per_match,1.3)))
    const ab=Math.sqrt(Math.max(.15,n(ap.attack_xg_per_match,1.3))*Math.max(.15,n(hp.defense_xga_per_match,1.3)))
    if(hb>0)homeRatios.push(n(m.home_xg,1.3)/hb)
    if(ab>0)awayRatios.push(n(m.away_xg,1.3)/ab)
  }
  const homeFactor=clamp(median(homeRatios),.8,1.35),awayFactor=clamp(median(awayRatios),.7,1.2)

  const matchInputs:any[]=[],matchPreds:any[]=[]
  for(const f of (fxQ.data||[])){
    const hp=profileBy.get(Number(f.home_team_id)),ap=profileBy.get(Number(f.away_team_id))
    if(!hp||!ap)throw new Error("TEAM_PROFILE_MISSING:"+f.match_id)
    const homeBase=Math.sqrt(Math.max(.15,n(hp.attack_xg_per_match,1.3))*Math.max(.15,n(ap.defense_xga_per_match,1.3)))
    const awayBase=Math.sqrt(Math.max(.15,n(ap.attack_xg_per_match,1.3))*Math.max(.15,n(hp.defense_xga_per_match,1.3)))
    const homeLambda=clamp(homeBase*homeFactor,.2,3.6),awayLambda=clamp(awayBase*awayFactor,.15,3.3)
    matchInputs.push({gameweek:targetGw,benchmark_version:benchmark,match_id:f.match_id,home_team_id:f.home_team_id,away_team_id:f.away_team_id,home_lambda:homeLambda,away_lambda:awayLambda,source_note:`weekly-auto from MH${sourceGw} profiles`})
    matchPreds.push({run_id:runId,match_id:f.match_id,gameweek:targetGw,kickoff_at:f.kickoff_at,home_team_id:f.home_team_id,away_team_id:f.away_team_id,home_xg:homeLambda,away_xg:awayLambda,...scoreModel(homeLambda,awayLambda),method:"Poisson • weekly-auto calibrated",model_note:`MH${targetGw} built after MH${sourceGw} closure`})
  }

  const rawGoalByTeam=new Map<number,Map<number,number>>(),rawAssistByTeam=new Map<number,Map<number,number>>()
  for(const p of players){
    const id=Number(p.id),team=Number(p.team_id),s=statBy.get(id),prev=prevBy.get(id)
    const mins=Math.max(1,n(s?.minutes))
    const xg90=n(s?.xg_total)*90/mins,xa90=n(s?.xa_model_per90,n(s?.xa_per90))
    const rates=prev?.rates||[]
    const goal=Math.max(.005,.7*xg90+.3*n(rates[1]))
    const assist=Math.max(.005,.7*xa90+.3*n(rates[2]))
    if(!rawGoalByTeam.has(team))rawGoalByTeam.set(team,new Map())
    if(!rawAssistByTeam.has(team))rawAssistByTeam.set(team,new Map())
    rawGoalByTeam.get(team)!.set(id,goal);rawAssistByTeam.get(team)!.set(id,assist)
  }
  const share=(map:Map<number,Map<number,number>>,team:number,id:number)=>{
    const m=map.get(team)||new Map(),sum=[...m.values()].reduce((a,b)=>a+b,0)
    return sum>0?n(m.get(id))/sum:0
  }

  const projectionRows:any[]=[],roleRows:any[]=[],inputRows:any[]=[],availabilityRows:any[]=[]
  for(const p of players){
    const id=Number(p.id),team=Number(p.team_id),old=projBy.get(id)||{},oldRole=roleBy.get(id)||{},a=avBy.get(id),s=statBy.get(id),prev=prevBy.get(id)||{}
    const recent=recentBy.get(id)||[],last2=recent.slice(0,2),prev2=recent.slice(2,4)
    const avg=(xs:any[])=>xs.length?xs.reduce((sum,x)=>sum+n(x.minutes),0)/xs.length:0
    const recentMinutes=avg(last2),previousMinutes=avg(prev2)
    const playSignal=last2.length?last2.reduce((sum,x)=>sum+(n(x.minutes)>=60?1:n(x.minutes)>0?.35:0),0)/last2.length:n(prev.role_probability,n(old.xi_probability,.5))
    const prevRole=n(prev.role_probability,n(oldRole.predicted_xi_probability,n(old.xi_probability,.5)))
    const roleProb=clamp(.7*prevRole+.3*playSignal,.01,.995)
    const avail=a?n(a.availability_probability,1):1
    const durations=(Array.isArray(prev.durations)&&prev.durations.length?prev.durations:recent.filter(x=>n(x.minutes)>0).slice(0,5).map(x=>Math.round(n(x.minutes)))).map(Number)
    const safeDurations=durations.length?durations:[Math.max(1,Math.round(n(old.x_minutes,60)))]
    const durationWeights=(Array.isArray(prev.duration_weights)&&prev.duration_weights.length===safeDurations.length?prev.duration_weights:safeDurations.map((_:any,i:number)=>Math.pow(.78,i)))
    const weightSum=durationWeights.reduce((x:number,y:number)=>x+n(y),0)||1
    const safeWeights=durationWeights.map((x:any)=>n(x)/weightSum)
    const mins=Math.max(1,n(s?.minutes)),oldRates=(prev.rates||[]).map(Number)
    const rates=[
      n(s?.xg_total)*90/mins,
      n(s?.goals)*90/mins,
      n(s?.assists)*90/mins,
      n(s?.xa_model_per90,n(s?.xa_per90,n(oldRates[3]))),
      n(s?.yellow_cards)*90/mins,
      n(s?.red_cards)*90/mins,
      n(s?.saves)*90/mins,
      n(oldRates[7]),n(oldRates[8]),n(s?.own_goals)*90/mins,
      n(s?.shots)*90/mins,n(s?.shots_on_target)*90/mins
    ]
    const fx=fixtureByTeam.get(team)
    if(!fx)throw new Error("PLAYER_FIXTURE_MISSING:"+id)
    const gShare=avail>0?share(rawGoalByTeam,team,id):0,aShare=avail>0?share(rawAssistByTeam,team,id):0
    roleRows.push({
      run_id:runId,player_id:id,last2_xi_probability:playSignal,previous2_xi_probability:n(oldRole.last2_xi_probability,prevRole),
      last2_minutes:recentMinutes,previous2_minutes:previousMinutes,signal:recentMinutes>=70?"stable_starter":recentMinutes>=30?"rotation":"bench_risk",
      predicted_xi_probability:roleProb,x_minutes:clamp(.65*n(old.x_minutes,recentMinutes)+.35*recentMinutes,0,90),
      team_goal_share:gShare,team_assist_share:aShare,availability_probability:avail
    })
    projectionRows.push({
      run_id:runId,player_id:id,opponent_name:fx.opponent_name,venue:fx.venue,
      xi_probability:roleProb,appearance_probability:clamp(Math.max(roleProb,n(old.appearance_probability,roleProb)),0,1),
      over60_probability:clamp(n(old.over60_probability,roleProb*.8),0,1),x_minutes:clamp(n(old.x_minutes,recentMinutes),0,90),
      core_xfp:0,x_bonus:0,xfp:0,p25:0,p75:0,p90:0,six_plus_probability:0,value_score:0,
      data_confidence:prev.data_confidence||old.data_confidence||"medium",confidence:prev.data_confidence||old.confidence||"medium",
      role_note:`MH${targetGw} auto • MH${sourceGw} sonrası güncel rol/dakika`,
      expected_goals:0,expected_assists:0,mc_standard_error:0,
      availability_source:a?.availability_type||"available",availability_probability:avail
    })
    inputRows.push({
      gameweek:targetGw,benchmark_version:benchmark,player_id:id,player_name:p.full_name,club_id:team,position:p.position,price:p.price,
      availability:avail,role_probability:roleProb,bench_weight:n(prev.bench_weight,1),durations:safeDurations,duration_weights:safeWeights,rates,
      data_confidence:prev.data_confidence||"medium",has_individual_prior:Boolean(prev.has_individual_prior),
      source_note:`weekly-auto MH${targetGw} from closed MH${sourceGw}`,sub_role:p.primary_role||prev.sub_role||null,role_side:p.role_side||prev.role_side||null,
      effective_xa_per90:rates[3]
    })
    if(a)availabilityRows.push({...a,run_id:runId})
  }

  for(const [team,m] of rawGoalByTeam){
    const eligible=roleRows.filter(x=>Number(players.find((p:any)=>Number(p.id)===Number(x.player_id))?.team_id)===team&&n(x.availability_probability)>0)
    const gs=eligible.reduce((z,x)=>z+n(x.team_goal_share),0),as=eligible.reduce((z,x)=>z+n(x.team_assist_share),0)
    if(gs>0)eligible.forEach(x=>x.team_goal_share=n(x.team_goal_share)/gs)
    if(as>0)eligible.forEach(x=>x.team_assist_share=n(x.team_assist_share)/as)
  }

  const meta=ctx.currentMeta||{}
  const metaRow={
    gameweek:targetGw,benchmark_version:benchmark,temperature:n(meta.temperature,1.7),
    assist_fraction:n(meta.assist_fraction,.67),own_goal_fraction:n(meta.own_goal_fraction,.031),
    simulation_seed:2026000000+targetGw*1000+sourceGw,source_note:`weekly-auto • source MH${sourceGw} closed • ${ctx.sourceStamp}`,
    formations:meta.formations||meta.team_formations||{},team_formations:meta.team_formations||meta.formations||{},lineup_factors:meta.lineup_factors||null
  }

  for(const [table,rows,conflict] of [
    ["scout_match_predictions",matchPreds,"run_id,match_id"],
    ["scout_role_signals",roleRows,"run_id,player_id"],
    ["scout_player_projections",projectionRows,"run_id,player_id"],
    ["scout_replay_player_inputs",inputRows,"gameweek,benchmark_version,player_id"],
    ["scout_replay_match_inputs",matchInputs,"gameweek,benchmark_version,match_id"],
  ] as any[]){
    const q=await sb.from(table).upsert(rows,{onConflict:conflict})
    if(q.error)throw q.error
  }
  if(availabilityRows.length){
    const q=await sb.from("scout_availability").upsert(availabilityRows,{onConflict:"run_id,player_id"})
    if(q.error)throw q.error
  }
  const mq=await sb.from("scout_replay_input_meta").upsert(metaRow,{onConflict:"gameweek,benchmark_version"})
  if(mq.error)throw mq.error

  await lifecyclePatch(sb,targetGw,{
    source_run_id:current.id,candidate_run_id:runId,benchmark_version:benchmark,execution_key:executionKey,
    stage:"prepared",status:"running",started_at:now,last_error:null,
    details:{source_stamp:ctx.sourceStamp,players:players.length,matches:matchPreds.length,home_factor:homeFactor,away_factor:awayFactor}
  })
  return {run_id:runId,gameweek:targetGw,benchmark,reused:false,execution_key:executionKey,players:players.length,matches:matchPreds.length}
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json().catch(()=>({}))
    const action=String(body.action||"status")
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const ctx=await context(sb)
    if(ctx.seasonComplete)return Response.json({ok:true,season_complete:true,current_gameweek:ctx.sourceGw})

    if(action==="status"){
      await lifecyclePatch(sb,ctx.targetGw,{
        source_run_id:ctx.current.id,stage:ctx.ready?"ready_to_prepare":"waiting",status:ctx.ready?"running":"waiting",
        details:{closure:ctx.closure,reasons:ctx.reasons,target_fixture_count:ctx.targetFixtureCount,expected_matches:ctx.expectedMatches,
          team_stats_count:ctx.teamStatsCount,player_stats_count:ctx.playerStatsCount,active_count:ctx.activeCount,
          availability_checked_at:ctx.availabilityCheckedAt,source_stamp:ctx.sourceStamp}
      })
      return Response.json({ok:true,...ctx})
    }
    if(action==="backtest"){
      if(!ctx.closure?.pass)return Response.json({ok:false,waiting:true,error:"source gameweek not closed",closure:ctx.closure},{status:409})
      const q=await sb.rpc("scout_close_live_backtest",{p_run_id:ctx.current.id})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data})
    }
    if(action==="prepare"){
      const result=await prepare(sb,ctx)
      return Response.json({ok:true,...result})
    }

    const runId=String(body.run_id||"")
    const benchmark=String(body.benchmark||"")
    if(!runId)return Response.json({error:"run_id required"},{status:400})

    if(action==="top25"){
      if(!benchmark)return Response.json({error:"benchmark required"},{status:400})
      const run=await one(sb,"scout_model_runs","id,gameweek",q=>q.eq("id",runId))
      if(!run)return Response.json({error:"run missing"},{status:404})
      const q=await sb.rpc("refresh_top25_gb_v1",{p_run_id:runId,p_gameweek:run.gameweek,p_benchmark:benchmark})
      if(q.error)throw q.error
      return Response.json({ok:true,updated:q.data})
    }
    if(action==="ready"){
      const q=await sb.from("scout_model_runs").update({status:"ready"}).eq("id",runId).eq("status","building")
      if(q.error)throw q.error
      await lifecyclePatch(sb,ctx.targetGw,{candidate_run_id:runId,benchmark_version:benchmark||null,stage:"candidate_ready",status:"running"})
      return Response.json({ok:true,run_id:runId})
    }
    if(action==="complete"){
      await lifecyclePatch(sb,ctx.targetGw,{candidate_run_id:runId,benchmark_version:benchmark||null,stage:"promoted",status:"complete",completed_at:new Date().toISOString(),last_error:null})
      return Response.json({ok:true})
    }
    if(action==="failed"){
      await lifecyclePatch(sb,ctx.targetGw,{candidate_run_id:runId||null,benchmark_version:benchmark||null,stage:String(body.stage||"failed"),status:"failed",last_error:String(body.error||"unknown").slice(0,1500)})
      return Response.json({ok:true})
    }
    return Response.json({error:"unknown action"},{status:400})
  }catch(error:any){
    return Response.json({error:String(error?.message||error),stack:String(error?.stack||"").slice(0,1200)},{status:500})
  }
})
