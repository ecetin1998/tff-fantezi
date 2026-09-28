import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUDIENCE="tff-fantezi-scout"
const ISSUER="https://token.actions.githubusercontent.com"
const REPOSITORY="ecetin1998/tff-fantezi"
const REPOSITORY_ID="1353738004"
const JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks"

function decodeJson(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")
  return JSON.parse(atob(padded))
}
function decodeBytes(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0))
}
async function verifyGithubOidc(token:string){
  const parts=token.split(".")
  if(parts.length!==3)return false
  const header=decodeJson(parts[0]),payload=decodeJson(parts[1]),now=Math.floor(Date.now()/1000)
  const audOk=Array.isArray(payload.aud)?payload.aud.includes(AUDIENCE):payload.aud===AUDIENCE
  if(
    header.alg!=="RS256"||!header.kid||payload.iss!==ISSUER||!audOk||
    Number(payload.exp||0)<now-30||Number(payload.nbf||0)>now+30||
    payload.repository_id!==REPOSITORY_ID||payload.repository!==REPOSITORY||
    payload.ref!=="refs/heads/main"||!["workflow_dispatch","schedule"].includes(String(payload.event_name||""))
  )return false
  const jwks=await fetch(JWKS_URL).then(r=>r.json())
  const jwk=(jwks.keys||[]).find((k:any)=>k.kid===header.kid)
  if(!jwk)return false
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])
  return crypto.subtle.verify(
    {name:"RSASSA-PKCS1-v1_5"},key,decodeBytes(parts[2]),
    new TextEncoder().encode(parts[0]+"."+parts[1])
  )
}
async function authorized(req:Request){
  const auth=req.headers.get("authorization")||""
  if(!auth.startsWith("Bearer "))return false
  try{return await verifyGithubOidc(auth.slice(7))}catch{return false}
}
const n=(v:any,d=0)=>Number.isFinite(Number(v))?Number(v):d
const clamp=(lo:number,hi:number,v:number)=>Math.max(lo,Math.min(hi,v))
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0
const per90=(v:any,minutes:any,fallback=0)=>n(minutes)>0?n(v)*90/n(minutes):fallback
const newer=(...xs:any[])=>xs.filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0]||Date.now()

function poisson(lambda:number,max=12){
  const out:number[]=[]
  let p=Math.exp(-lambda),sum=p
  out.push(p)
  for(let k=1;k<=max;k++){p=p*lambda/k;out.push(p);sum+=p}
  if(sum<.999999)out[out.length-1]+=1-sum
  return out
}
function matchPrediction(homeLambda:number,awayLambda:number){
  const hp=poisson(homeLambda),ap=poisson(awayLambda)
  let home=0,draw=0,away=0,over15=0,over25=0,over35=0,threeMargin=0
  const scores:{score:string,p:number}[]=[]
  for(let h=0;h<hp.length;h++)for(let a=0;a<ap.length;a++){
    const p=hp[h]*ap[a]
    scores.push({score:h+"-"+a,p})
    if(h>a)home+=p;else if(h===a)draw+=p;else away+=p
    if(h+a>=2)over15+=p
    if(h+a>=3)over25+=p
    if(h+a>=4)over35+=p
    if(Math.abs(h-a)>=3)threeMargin+=p
  }
  const total=home+draw+away||1
  scores.sort((a,b)=>b.p-a.p)
  return {
    home_win_probability:home/total,draw_probability:draw/total,away_win_probability:away/total,
    home_cs_probability:Math.exp(-awayLambda),away_cs_probability:Math.exp(-homeLambda),
    btts_probability:(1-Math.exp(-homeLambda))*(1-Math.exp(-awayLambda)),
    over15_probability:over15,over25_probability:over25,over35_probability:over35,
    three_goal_margin_probability:threeMargin,
    top_score:scores[0]?.score||"0-0",top_score_probability:scores[0]?.p||0,
    second_score:scores[1]?.score||"1-0",second_score_probability:scores[1]?.p||0,
    third_score:scores[2]?.score||"0-1",third_score_probability:scores[2]?.p||0,
  }
}
function matchupLambda(att:any,opp:any,home:boolean){
  const attXg=Math.max(.2,n(att?.xg_per_match,1.25))
  const oppXga=Math.max(.2,n(opp?.xga_per_match,1.25))
  const base=(attXg+oppXga)/2
  const attActual=n(att?.matches_played)>0?n(att?.goals_for)/n(att?.matches_played):attXg
  const oppActual=n(opp?.matches_played)>0?n(opp?.goals_against)/n(opp?.matches_played):oppXga
  const finish=clamp(.75,1.25,attActual/attXg)
  const concede=clamp(.75,1.25,oppActual/oppXga)
  const efficiency=Math.sqrt((.7+.3*finish)*(.7+.3*concede))
  return clamp(.2,4.0,base*efficiency*(home?1.05:.88))
}
function normalizedWeights(length:number){
  const raw=Array.from({length},(_,i)=>Math.max(1,5-i))
  const total=raw.reduce((a,b)=>a+b,0)||1
  return raw.map(x=>x/total)
}

async function sourceStatus(sb:any,current:any){
  const gw=Number(current.gameweek),target=gw+1
  const [preds,hist,weekly,teamStats,playerStats,players,targetHist]=await Promise.all([
    sb.from("scout_match_predictions").select("match_id").eq("run_id",current.id),
    sb.from("scout_match_history").select("match_id,match_status,fantasy_closure,source_updated_at").eq("season","2026-27").eq("gameweek",gw),
    sb.from("scout_player_weekly_points").select("match_id,is_final,source_updated_at").eq("gameweek",gw),
    sb.from("scout_team_season_stats").select("team_id,source_updated_at").eq("through_gameweek",gw),
    sb.from("scout_player_season_stats").select("player_id,updated_at").eq("season","2026-27").eq("through_gameweek",gw),
    sb.from("scout_players").select("id,team_id").eq("active",true),
    sb.from("scout_match_history").select("match_id,home_team_id,away_team_id,kickoff_at,source_updated_at").eq("season","2026-27").eq("gameweek",target)
  ])
  for(const q of [preds,hist,weekly,teamStats,playerStats,players,targetHist])if(q.error)throw q.error
  const fixtureCount=(preds.data||[]).length
  const closed=(hist.data||[]).filter((m:any)=>m.match_status==="Bitti"&&m.fantasy_closure==="KAPANDI").length
  const finalMatches=new Set((weekly.data||[]).filter((w:any)=>w.is_final).map((w:any)=>String(w.match_id))).size
  const activeIds=new Set((players.data||[]).map((p:any)=>Number(p.id)))
  const playerStatActive=(playerStats.data||[]).filter((x:any)=>activeIds.has(Number(x.player_id))).length
  const targetTeams=new Set((targetHist.data||[]).flatMap((m:any)=>[Number(m.home_team_id),Number(m.away_team_id)]))
  const completeCurrent=fixtureCount>0&&closed===fixtureCount&&finalMatches===fixtureCount&&
    (teamStats.data||[]).length===18&&playerStatActive===activeIds.size
  const targetReady=(targetHist.data||[]).length>0&&targetTeams.size===18
  return {
    current_gameweek:gw,target_gameweek:target,current_run_id:current.id,
    fixture_count:fixtureCount,closed_matches:closed,final_actual_matches:finalMatches,
    active_players:activeIds.size,player_stats_current:playerStatActive,team_stats_current:(teamStats.data||[]).length,
    target_fixture_count:(targetHist.data||[]).length,target_team_count:targetTeams.size,
    complete_current:completeCurrent,target_ready:targetReady,ready_to_advance:completeCurrent&&targetReady,
    latest_source_at:new Date(newer(
      ...(hist.data||[]).map((x:any)=>x.source_updated_at),
      ...(weekly.data||[]).map((x:any)=>x.source_updated_at),
      ...(teamStats.data||[]).map((x:any)=>x.source_updated_at),
      ...(playerStats.data||[]).map((x:any)=>x.updated_at),
      ...(targetHist.data||[]).map((x:any)=>x.source_updated_at)
    )).toISOString()
  }
}

async function prepare(sb:any,current:any,status:any){
  if(!status.ready_to_advance)throw new Error("SOURCE_NOT_READY")
  const target=Number(status.target_gameweek)
  const priorMetaQ=await sb.from("scout_replay_input_meta").select("*")
    .eq("gameweek",Number(current.gameweek)).order("created_at",{ascending:false}).limit(1).maybeSingle()
  if(priorMetaQ.error)throw priorMetaQ.error
  if(!priorMetaQ.data)throw new Error("CURRENT_SIM_INPUT_META_MISSING")
  const priorBenchmark=String(priorMetaQ.data.benchmark_version)
  const key="weekly-auto:"+current.id+":mh"+target
  const existing=await sb.from("scout_model_runs").select("*").eq("gameweek",target).eq("is_current",false)
    .ilike("notes","%"+key+"%").order("generated_at",{ascending:false}).limit(1).maybeSingle()
  if(existing.error)throw existing.error
  if(existing.data?.status==="ready"){
    const meta=await sb.from("scout_replay_input_meta").select("benchmark_version").eq("gameweek",target)
      .ilike("source_note","%"+key+"%").order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(meta.error)throw meta.error
    if(meta.data)return {reused:true,run_id:existing.data.id,gameweek:target,benchmark:meta.data.benchmark_version}
  }

  let runId=existing.data?.id
  if(runId){
    for(const table of ["scout_squad_members","scout_squad_recommendations"]){
      // recommendation rows are cleaned by optimizer; no-op here for FK-safe reset.
      void table
    }
    for(const table of ["scout_player_projections","scout_role_signals","scout_availability","scout_match_predictions"]){
      const del=await sb.from(table).delete().eq("run_id",runId);if(del.error)throw del.error
    }
    const upd=await sb.from("scout_model_runs").update({status:"building",simulation_count:0,generated_at:new Date().toISOString(),source_updated_at:status.latest_source_at}).eq("id",runId)
    if(upd.error)throw upd.error
  }else{
    runId=crypto.randomUUID()
    const ins=await sb.from("scout_model_runs").insert({
      id:runId,gameweek:target,model_version:"ScoutPlus Weekly Auto v1",
      generated_at:new Date().toISOString(),source_updated_at:status.latest_source_at,
      simulation_count:0,status:"building",is_current:false,notes:key+" • fail-closed weekly lifecycle"
    })
    if(ins.error)throw ins.error
  }

  const benchmark="weekly-auto-mh"+target+"-"+String(current.id).slice(0,8)
  for(const table of ["scout_replay_sim_accum","scout_replay_player_inputs","scout_replay_match_inputs","scout_replay_input_meta"]){
    const del=await sb.from(table).delete().eq("gameweek",target).eq("benchmark_version",benchmark)
    if(del.error)throw del.error
  }

  const [
    playersQ,rolesQ,availabilityQ,statsQ,teamStatsQ,fixturesQ,weeklyQ,priorInputsQ,teamsQ,currentProjQ
  ]=await Promise.all([
    sb.from("scout_players").select("id,full_name,team_id,position,price,primary_role,role_side,active").eq("active",true),
    sb.from("scout_role_signals").select("*").eq("run_id",current.id),
    sb.from("scout_availability").select("*").eq("run_id",current.id),
    sb.from("scout_player_season_stats").select("*").eq("season","2026-27").eq("through_gameweek",Number(current.gameweek)),
    sb.from("scout_team_season_stats").select("*").eq("through_gameweek",Number(current.gameweek)),
    sb.from("scout_match_history").select("*").eq("season","2026-27").eq("gameweek",target).order("kickoff_at"),
    sb.from("scout_player_weekly_points").select("player_id,gameweek,match_id,minutes,points,is_final").lt("gameweek",target).eq("is_final",true).order("gameweek",{ascending:false}).limit(10000),
    sb.from("scout_replay_player_inputs").select("*").eq("gameweek",Number(current.gameweek)).eq("benchmark_version",priorBenchmark),
    sb.from("scout_teams").select("id,name"),
    sb.from("scout_player_projections").select("player_id,confidence,data_confidence").eq("run_id",current.id)
  ])
  for(const q of [playersQ,rolesQ,availabilityQ,statsQ,teamStatsQ,fixturesQ,weeklyQ,priorInputsQ,teamsQ,currentProjQ])if(q.error)throw q.error
  const players=playersQ.data||[]
  if((availabilityQ.data||[]).length<players.length)throw new Error("AVAILABILITY_COVERAGE_INCOMPLETE")
  if((teamStatsQ.data||[]).length!==18)throw new Error("TEAM_STATS_INCOMPLETE")
  if(!(fixturesQ.data||[]).length)throw new Error("TARGET_FIXTURES_MISSING")

  const roleMap=new Map((rolesQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const avMap=new Map((availabilityQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const statsMap=new Map((statsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const teamStats=new Map((teamStatsQ.data||[]).map((x:any)=>[Number(x.team_id),x]))
  const priorMap=new Map((priorInputsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const teamNames=new Map((teamsQ.data||[]).map((x:any)=>[Number(x.id),x.name]))
  const projMap=new Map((currentProjQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const recent=new Map<number,any[]>()
  for(const w of weeklyQ.data||[]){
    const id=Number(w.player_id);if(!recent.has(id))recent.set(id,[]);recent.get(id)!.push(w)
  }
  const teamFixtures=new Map<number,any[]>()
  const matchInputs:any[]=[],matchPredictions:any[]=[]
  for(const fx of fixturesQ.data||[]){
    const hs=teamStats.get(Number(fx.home_team_id)),as=teamStats.get(Number(fx.away_team_id))
    if(!hs||!as)throw new Error("TEAM_STATS_MISSING_FOR_FIXTURE_"+fx.match_id)
    const hl=matchupLambda(hs,as,true),al=matchupLambda(as,hs,false),prob=matchPrediction(hl,al)
    matchInputs.push({
      gameweek:target,benchmark_version:benchmark,match_id:Number(fx.match_id),
      home_team_id:Number(fx.home_team_id),away_team_id:Number(fx.away_team_id),
      home_lambda:hl,away_lambda:al,source_note:key+" • team xG/xGA + observed finishing/conceding blend"
    })
    matchPredictions.push({
      run_id:runId,match_id:Number(fx.match_id),gameweek:target,kickoff_at:fx.kickoff_at,
      home_team_id:Number(fx.home_team_id),away_team_id:Number(fx.away_team_id),
      home_xg:hl,away_xg:al,...prob,method:"weekly-auto-v1",
      model_note:"Geçen hafta kapanışından sonra güncel takım xG/xGA ve gerçekleşen bitiricilik/savunma profiliyle üretildi."
    })
    const h={opponent:teamNames.get(Number(fx.away_team_id))||"—",venue:"HOME"}
    const a={opponent:teamNames.get(Number(fx.home_team_id))||"—",venue:"AWAY"}
    teamFixtures.set(Number(fx.home_team_id),[...(teamFixtures.get(Number(fx.home_team_id))||[]),h])
    teamFixtures.set(Number(fx.away_team_id),[...(teamFixtures.get(Number(fx.away_team_id))||[]),a])
  }

  const inputRows:any[]=[],projectionRows:any[]=[],availabilityRows:any[]=[]
  const roleDraft:any[]=[]
  const weightsByTeam=new Map<number,{id:number,goal:number,assist:number,available:number}[]>()
  for(const p of players){
    const id=Number(p.id),prior=priorMap.get(id)||{},s=statsMap.get(id)||{},r=roleMap.get(id)||{},av=avMap.get(id)
    if(!av)throw new Error("AVAILABILITY_MISSING_"+id)
    const rows=(recent.get(id)||[]).slice(0,5)
    let durations=rows.map(x=>clamp(1,90,n(x.minutes))).filter(x=>x>0)
    if(!durations.length)durations=(prior.durations||[]).map((x:any)=>clamp(1,90,n(x))).filter((x:number)=>x>0)
    if(!durations.length)durations=[p.position==="GK"?90:70]
    durations=durations.slice(0,5)
    const durationWeights=normalizedWeights(durations.length)
    const recentMinuteRate=rows.length?clamp(0,1,avg(rows.slice(0,3).map(x=>n(x.minutes)/90))):n(prior.role_probability,n(r.predicted_xi_probability,.5))
    const roleProb=clamp(.01,.995,.65*n(r.predicted_xi_probability,n(prior.role_probability,.5))+.35*recentMinuteRate)
    const minutes=Math.max(0,n(s.minutes))
    const priorRates=(prior.rates||[]).map(Number)
    const xg90=per90(s.xg_total,minutes,n(priorRates[0]))
    const g90=per90(s.goals,minutes,n(priorRates[1]))
    const a90=per90(s.assists,minutes,n(priorRates[2]))
    const xa90=n(s.xa_per90,n(s.xa_model_per90,n(prior.effective_xa_per90,n(priorRates[3]))))
    const yc90=per90(s.yellow_cards,minutes,n(priorRates[4]))
    const rc90=per90(s.red_cards,minutes,n(priorRates[5]))
    const saves90=per90(s.saves,minutes,n(priorRates[6]))
    const shots90=per90(s.shots,minutes,n(priorRates[10]))
    const sot90=per90(s.shots_on_target,minutes,n(priorRates[11]))
    const rates=[xg90,g90,a90,xa90,yc90,rc90,saves90,n(priorRates[7]),n(priorRates[8]),n(priorRates[9]),shots90,sot90]
    const availability=clamp(0,1,n(av.availability_probability,1))
    inputRows.push({
      gameweek:target,benchmark_version:benchmark,player_id:id,player_name:p.full_name,club_id:Number(p.team_id),
      position:p.position,price:n(p.price),availability,role_probability:roleProb,
      bench_weight:n(prior.bench_weight,1),durations,duration_weights:durationWeights,rates,
      data_confidence:prior.data_confidence||projMap.get(id)?.confidence||"medium",
      has_individual_prior:Boolean(prior.has_individual_prior),source_note:key,
      sub_role:p.primary_role||prior.sub_role||null,role_side:p.role_side||prior.role_side||null,
      effective_xa_per90:xa90
    })
    const fx=teamFixtures.get(Number(p.team_id))||[]
    projectionRows.push({
      run_id:runId,player_id:id,opponent_name:fx.map(x=>x.opponent).join(" + ")||"—",
      venue:fx[0]?.venue||"HOME",xi_probability:0,appearance_probability:0,over60_probability:0,x_minutes:0,
      core_xfp:0,x_bonus:0,xfp:0,p25:0,p75:0,p90:0,six_plus_probability:0,
      value_score:0,data_confidence:prior.data_confidence||"medium",role_note:null,
      expected_goals:0,expected_assists:0,mc_standard_error:0,
      availability_source:"weekly-lifecycle",availability_probability:availability,
      top25_score:null,top25_rank:null,top25_model_version:null,confidence:projMap.get(id)?.confidence||"medium"
    })
    const last2=rows.slice(0,2),prev2=rows.slice(2,4)
    const last2Min=avg(last2.map(x=>n(x.minutes))),prev2Min=avg(prev2.map(x=>n(x.minutes)))
    const last2Xi=avg(last2.map(x=>clamp(0,1,n(x.minutes)/60))),prev2Xi=avg(prev2.map(x=>clamp(0,1,n(x.minutes)/60)))
    const d=last2Xi-prev2Xi
    const signal=d>.20?"ROL YÜKSELİYOR":d<-.20?"ROL DÜŞÜYOR":"BELİRGİN DEĞİŞİM YOK"
    const goalWeight=Math.max(1e-6,.75*xg90+.25*g90)
    const assistWeight=Math.max(1e-6,.70*xa90+.30*a90)
    roleDraft.push({run_id:runId,player_id:id,last2_xi_probability:last2Xi,previous2_xi_probability:prev2Xi,last2_minutes:last2Min,previous2_minutes:prev2Min,signal,predicted_xi_probability:roleProb,x_minutes:0,availability_probability:availability,goalWeight,assistWeight,team_id:Number(p.team_id)})
    if(!weightsByTeam.has(Number(p.team_id)))weightsByTeam.set(Number(p.team_id),[])
    weightsByTeam.get(Number(p.team_id))!.push({id,goal:goalWeight,assist:assistWeight,available:availability})
    const {run_id:_,...copy}=av
    availabilityRows.push({...copy,run_id:runId})
  }
  const roleRows=roleDraft.map(x=>{
    const peers=(weightsByTeam.get(x.team_id)||[]).filter(z=>z.available>0)
    const goalSum=peers.reduce((s,z)=>s+z.goal,0)||1,assistSum=peers.reduce((s,z)=>s+z.assist,0)||1
    const me=peers.find(z=>z.id===x.player_id)
    const {goalWeight,assistWeight,team_id,...row}=x
    return {...row,team_goal_share:me?me.goal/goalSum:0,team_assist_share:me?me.assist/assistSum:0}
  })

  const meta={
    gameweek:target,benchmark_version:benchmark,
    temperature:n(priorMetaQ.data.temperature,1.7),assist_fraction:n(priorMetaQ.data.assist_fraction,.67),
    own_goal_fraction:n(priorMetaQ.data.own_goal_fraction,.031),simulation_seed:2026000000+target*1000,
    source_note:key+" • generated from closed MH"+current.gameweek,
    formations:priorMetaQ.data.formations,team_formations:priorMetaQ.data.team_formations,
    lineup_factors:priorMetaQ.data.lineup_factors
  }
  for(const [table,rows] of [
    ["scout_replay_input_meta",[meta]],["scout_replay_match_inputs",matchInputs],
    ["scout_replay_player_inputs",inputRows],["scout_match_predictions",matchPredictions],
    ["scout_availability",availabilityRows],["scout_player_projections",projectionRows],
    ["scout_role_signals",roleRows]
  ] as any[]){
    const ins=await sb.from(table).insert(rows)
    if(ins.error)throw new Error(table+": "+ins.error.message)
  }
  return {reused:false,run_id:runId,gameweek:target,benchmark,players:inputRows.length,matches:matchInputs.length,key}
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json().catch(()=>({}))
    const action=String(body.action||"status")
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const currentQ=await sb.from("scout_model_runs").select("*").eq("is_current",true).eq("status","ready").order("generated_at",{ascending:false}).limit(1).maybeSingle()
    if(currentQ.error)throw currentQ.error
    if(!currentQ.data)return Response.json({error:"current run missing"},{status:409})
    const current=currentQ.data
    const status=await sourceStatus(sb,current)

    if(action==="status")return Response.json({ok:true,...status})
    if(action==="close_backtest"){
      if(!status.complete_current)return Response.json({ok:false,error:"current gameweek not fully closed",...status},{status:409})
      const q=await sb.rpc("scout_close_live_backtest",{p_run_id:current.id})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data,...status})
    }
    if(action==="prepare"){
      const result=await prepare(sb,current,status)
      return Response.json({ok:true,...result})
    }
    if(action==="snapshot"){
      const runId=String(body.run_id||"")
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const q=await sb.rpc("scout_snapshot_live_backtest",{p_run_id:runId})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data})
    }
    if(action==="verify"){
      const expected=Number(body.gameweek||status.target_gameweek)
      const runs=await sb.from("scout_model_runs").select("id,gameweek,is_current,status").eq("is_current",true)
      if(runs.error)throw runs.error
      const pass=(runs.data||[]).length===1&&Number(runs.data?.[0]?.gameweek)===expected&&runs.data?.[0]?.status==="ready"
      return Response.json({ok:pass,pass,current:runs.data?.[0]||null,expected_gameweek:expected},{status:pass?200:409})
    }
    return Response.json({error:"unknown action"},{status:400})
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
