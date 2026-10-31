import {createClient} from "https://esm.sh/@supabase/supabase-js@2"
import {applyOfficialMinutesEvidence,firstRecordedRate,observedPer90} from "./externalRole.mjs"
import {validFinalWeeklyPlayerRow} from "./closureSource.mjs"
import {risingMinutesMomentum,trustedMinute} from "./momentum.mjs"
import {reconcileDefenderXa} from "./defenderXa.mjs"
import {fetchTrustedWeeklyEvidence} from "./weeklyEvidence.mjs"
import {roleTrendFromWeeklyEvidence} from "./roleTrend.mjs"
import {blendVerifiedAttackRate} from "./mh8Attack.mjs"
import {calibrateAttackRates} from "./roleAwareAttackRates.mjs"
import {recentAttackForm,fetchRecentAttackEvidence,groupRecentAttack} from "./recentAttackForm.mjs"
import {currentTacticalRole} from "./recentTacticalRole.mjs"
import {applyTeamMatchForm,recalibrateAnchoredMatchForm,auditMatchAllocation,auditRealizedModel} from "./teamRecentForm.mjs"
import {credibleAttackWeights} from "./defenderOpportunity.mjs"
import {frozenAccuracyReport} from "./frozenAccuracy.mjs"

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
    payload.ref!=="refs/heads/main"||!["workflow_dispatch","schedule","push"].includes(String(payload.event_name||""))
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
const per90=(v:any,minutes:any,fallback=0)=>observedPer90(v,minutes,fallback)
const newer=(...xs:any[])=>xs.filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0]||Date.now()

const officialEvidenceQuery=(sb:any)=>sb.from("scout_official_external_appearances")
  .select("match_ref,player_id,team_id,competition,finished_at,squad_status,started,minutes,source_url,source_updated_at")
  .gte("finished_at",new Date(Date.now()-22*86400000).toISOString())
  .lte("finished_at",new Date().toISOString())
  .order("finished_at",{ascending:false}).limit(10000)
function officialMatchEvidence(rows:any[],players:any[]){
  const known=new Map(players.map((p:any)=>[Number(p.id),p]))
  const latest=new Map<number,any>(),starters=new Map<string,Set<number>>()
  for(const e of rows||[]){
    const id=Number(e.player_id),p=known.get(id)
    if(!p||Number(p.team_id)!==Number(e.team_id))continue
    if(!latest.has(id))latest.set(id,e)
    if(e.started&&Number(e.minutes)>0){
      const key=String(e.match_ref)+"|"+e.team_id
      if(!starters.has(key))starters.set(key,new Set())
      starters.get(key)!.add(id)
    }
  }
  function directCompetitor(player:any,event:any){
    const role=String(player.primary_role||"").toUpperCase()
    if(!((player.position==="FWD"&&role==="ST")||player.position==="GK"))return false
    const ids=starters.get(String(event.match_ref)+"|"+player.team_id)||new Set()
    return [...ids].some(id=>{
      if(id===Number(player.id))return false
      const p=known.get(id)
      return p?.position===player.position&&String(p.primary_role||"").toUpperCase()===role
    })
  }
  return {latest,directCompetitor}
}
const sourceRevision=(value:any)=>new Date(value).toISOString().replace(/[-:TZ.]/g,"").slice(0,14)
const ageHours=(value:any)=>{
  if(!value)return Infinity
  const ts=new Date(value).getTime()
  return Number.isFinite(ts)?Math.max(0,(Date.now()-ts)/36e5):Infinity
}
async function snapshotHash(value:any){
  const payload=new TextEncoder().encode(JSON.stringify(value))
  const digest=await crypto.subtle.digest("SHA-256",payload)
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("")
}

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
async function linkLifecycle(sb:any,current:any,target:number,runId:string,benchmark:string,key:string,status:any){
  const now=new Date().toISOString()
  const q=await sb.from("scout_weekly_lifecycle").upsert({
    target_gameweek:target,
    source_gameweek:Number(current.gameweek),
    source_run_id:current.id,
    candidate_run_id:runId,
    benchmark_version:benchmark,
    execution_key:key,
    stage:"prepared",
    status:"running",
    details:{source_revision:sourceRevision(status.latest_source_at),latest_source_at:status.latest_source_at},
    started_at:now,
    updated_at:now,
    last_error:null,
  },{onConflict:"target_gameweek"})
  if(q.error)throw q.error
}

async function sourceStatus(sb:any,current:any){
  const gw=Number(current.gameweek),target=gw+1
  const [preds,hist,weekly,teamStats,playerStats,players,targetHist,availability]=await Promise.all([
    sb.from("scout_match_predictions").select("match_id").eq("run_id",current.id),
    sb.from("scout_match_history").select("match_id,match_status,fantasy_closure,source_updated_at").eq("season","2026-27").eq("gameweek",gw),
    sb.from("scout_player_weekly_points").select("player_id,match_id,minutes,points,base_points,bonus_points,is_final,source_kind,source_updated_at").eq("gameweek",gw),
    sb.from("scout_team_season_stats").select("team_id,source_updated_at").eq("through_gameweek",gw),
    sb.from("scout_player_season_stats").select("player_id,updated_at").eq("season","2026-27").eq("through_gameweek",gw),
    sb.from("scout_players").select("id,team_id,updated_at").eq("active",true),
    sb.from("scout_match_history").select("match_id,home_team_id,away_team_id,kickoff_at,source_updated_at").eq("season","2026-27").eq("gameweek",target),
    sb.from("scout_availability").select("player_id,checked_at,detail_source_updated_at").eq("run_id",current.id)
  ])
  for(const q of [preds,hist,weekly,teamStats,playerStats,players,targetHist,availability])if(q.error)throw q.error
  const fixtureCount=(preds.data||[]).length
  const closed=(hist.data||[]).filter((m:any)=>m.match_status==="Bitti"&&m.fantasy_closure==="KAPANDI").length
  const finalRows=(weekly.data||[]).filter((w:any)=>w.is_final)
  const finalMatches=new Set(finalRows.map((w:any)=>String(w.match_id))).size
  const activeIds=new Set((players.data||[]).map((p:any)=>Number(p.id)))
  // Finalization MUST cover every registered active player including reserves
  // who did not play. MH7 had exactly one sourced final row per 456 players.
  // One fabricated final point in each fixture can no longer advance MH9.
  const finalActiveRows=finalRows.filter((w:any)=>activeIds.has(Number(w.player_id)))
  const finalActiveIds=new Set(finalActiveRows.map((w:any)=>Number(w.player_id)))
  // Distinct source lineage: MH8 owner-approved computed actuals remain
  // labelled independently_calculated_source_events (not TFF official exports).
  const validFinalRows=finalActiveRows.every((w:any)=>validFinalWeeklyPlayerRow(gw,w))
  const finalByMatch=new Map<string,Set<number>>()
  for(const row of finalActiveRows){
    const id=String(row.match_id)
    if(!finalByMatch.has(id))finalByMatch.set(id,new Set())
    finalByMatch.get(id)!.add(Number(row.player_id))
  }
  const finalizedPlayerCoverage=validFinalRows&&
    finalActiveIds.size===activeIds.size&&
    finalActiveRows.length===activeIds.size&&
    [...finalByMatch.values()].every(ids=>ids.size>=22)&&
    finalByMatch.size===fixtureCount
  const playerStatActive=(playerStats.data||[]).filter((x:any)=>activeIds.has(Number(x.player_id))).length
  const targetTeams=new Set((targetHist.data||[]).flatMap((m:any)=>[Number(m.home_team_id),Number(m.away_team_id)]))
  const completeCurrent=fixtureCount>0&&closed===fixtureCount&&finalMatches===fixtureCount&&
    finalizedPlayerCoverage&&
    (teamStats.data||[]).length===18&&playerStatActive===activeIds.size
  const targetReady=(targetHist.data||[]).length>0&&targetTeams.size===18
  return {
    current_gameweek:gw,target_gameweek:target,current_run_id:current.id,
    fixture_count:fixtureCount,closed_matches:closed,final_actual_matches:finalMatches,
    finalized_active_players:finalActiveIds.size,finalized_player_rows:finalActiveRows.length,
    finalized_player_coverage_pass:finalizedPlayerCoverage,
    active_players:activeIds.size,player_stats_current:playerStatActive,team_stats_current:(teamStats.data||[]).length,
    target_fixture_count:(targetHist.data||[]).length,target_team_count:targetTeams.size,
    complete_current:completeCurrent,target_ready:targetReady,ready_to_advance:completeCurrent&&targetReady,
    latest_source_at:new Date(newer(
      ...(hist.data||[]).map((x:any)=>x.source_updated_at),
      ...(weekly.data||[]).map((x:any)=>x.source_updated_at),
      ...(teamStats.data||[]).map((x:any)=>x.source_updated_at),
      ...(playerStats.data||[]).map((x:any)=>x.updated_at),
      ...(players.data||[]).map((x:any)=>x.updated_at),
      ...(availability.data||[]).map((x:any)=>x.detail_source_updated_at),
      ...(targetHist.data||[]).map((x:any)=>x.source_updated_at)
    )).toISOString()
  }
}

async function prepare(sb:any,current:any,status:any,body:any={}){
  if(!status.ready_to_advance)throw new Error("SOURCE_NOT_READY")
  const target=Number(status.target_gameweek)
  const goalConfigQ=await sb.from("scout_goal_distribution_config")
    .select("version,alpha_used,gate_benchmark").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle()
  if(goalConfigQ.error)throw goalConfigQ.error
  const codeSha=String(body.code_sha||"").trim()||null
  const configVersion=goalConfigQ.data?.version
    ?[goalConfigQ.data.version,goalConfigQ.data.alpha_used!=null?`alpha=${goalConfigQ.data.alpha_used}`:null,goalConfigQ.data.gate_benchmark||null].filter(Boolean).join('|')
    :null
  const priorMetaQ=await sb.from("scout_replay_input_meta").select("*")
    .eq("gameweek",Number(current.gameweek)).order("created_at",{ascending:false}).limit(1).maybeSingle()
  if(priorMetaQ.error)throw priorMetaQ.error
  if(!priorMetaQ.data)throw new Error("CURRENT_SIM_INPUT_META_MISSING")
  const priorBenchmark=String(priorMetaQ.data.benchmark_version)
  const baselineRevision=sourceRevision(status.latest_source_at)
  const officialQ=await officialEvidenceQuery(sb)
  if(officialQ.error)throw officialQ.error
  const latestOfficialAt=(officialQ.data||[]).reduce(
    (time:any,e:any)=>newer(time,e.source_updated_at),status.latest_source_at
  )
  const revision=sourceRevision(latestOfficialAt)||baselineRevision
  const key="weekly-auto:"+current.id+":mh"+target+":"+revision
  const existing=await sb.from("scout_model_runs").select("*").eq("gameweek",target).eq("is_current",false)
    .ilike("notes","%"+key+"%").order("generated_at",{ascending:false}).limit(1).maybeSingle()
  if(existing.error)throw existing.error
  if(existing.data?.status==="ready"){
    const meta=await sb.from("scout_replay_input_meta").select("benchmark_version").eq("gameweek",target)
      .ilike("source_note","%"+key+"%").order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(meta.error)throw meta.error
    if(meta.data){
      await linkLifecycle(sb,current,target,existing.data.id,String(meta.data.benchmark_version),key,status)
      return {reused:true,run_id:existing.data.id,gameweek:target,benchmark:meta.data.benchmark_version}
    }
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
    const upd=await sb.from("scout_model_runs").update({
      status:"building",simulation_count:0,generated_at:new Date().toISOString(),
      source_updated_at:status.latest_source_at,source_cutoff:status.latest_source_at,
      code_sha:codeSha,config_version:configVersion,input_snapshot_hash:null
    }).eq("id",runId)
    if(upd.error)throw upd.error
  }else{
    runId=crypto.randomUUID()
    const ins=await sb.from("scout_model_runs").insert({
      id:runId,gameweek:target,
      model_version:String(current.model_version||"ScoutPlus 3.3").replace(/(GW|MH)\s*\d+/i,"GW"+target),
      generated_at:new Date().toISOString(),source_updated_at:status.latest_source_at,source_cutoff:status.latest_source_at,
      simulation_count:0,status:"building",is_current:false,notes:key+" • fail-closed weekly lifecycle",
      code_sha:codeSha,config_version:configVersion
    })
    if(ins.error)throw ins.error
  }

  const benchmark="weekly-auto-mh"+target+"-"+String(current.id).slice(0,8)+"-"+revision
  for(const table of ["scout_replay_sim_accum","scout_replay_player_inputs","scout_replay_match_inputs","scout_replay_input_meta"]){
    const del=await sb.from(table).delete().eq("gameweek",target).eq("benchmark_version",benchmark)
    if(del.error)throw del.error
  }

  const [
    playersQ,rolesQ,availabilityQ,statsQ,teamStatsQ,fixturesQ,weeklyQ,priorInputsQ,teamsQ,currentProjQ,tacticalQ,teamHistoryQ,recentAttackQ
  ]=await Promise.all([
    sb.from("scout_players").select("id,full_name,team_id,position,price,primary_role,role_side,active").eq("active",true),
    sb.from("scout_role_signals").select("*").eq("run_id",current.id),
    sb.from("scout_availability").select("*").eq("run_id",current.id),
    sb.from("scout_player_season_stats").select("*").eq("season","2026-27").eq("through_gameweek",Number(current.gameweek)),
    sb.from("scout_team_season_stats").select("*").eq("through_gameweek",Number(current.gameweek)),
    sb.from("scout_match_history").select("*").eq("season","2026-27").eq("gameweek",target).order("kickoff_at"),
    fetchTrustedWeeklyEvidence(sb,target),
    sb.from("scout_replay_player_inputs").select("*").eq("gameweek",Number(current.gameweek)).eq("benchmark_version",priorBenchmark),
    sb.from("scout_teams").select("id,name"),
    sb.from("scout_player_projections").select("player_id,confidence,data_confidence").eq("run_id",current.id),
    sb.from("scout_player_tactical_role_observations")
      .select("player_id,gameweek,role,side,minutes,started,verified,observed_at")
      .eq("season","2026-27").gte("gameweek",Math.max(1,target-3)).lt("gameweek",target)
      .eq("verified",true),
    sb.from("scout_match_history").select("gameweek,home_team_id,away_team_id,home_goals,away_goals,match_status,fantasy_closure")
      .eq("season","2026-27").gte("gameweek",Math.max(1,target-8)).lt("gameweek",target),
    fetchRecentAttackEvidence(sb,target)
  ])
  for(const q of [playersQ,rolesQ,availabilityQ,statsQ,teamStatsQ,fixturesQ,weeklyQ,priorInputsQ,teamsQ,currentProjQ,tacticalQ,teamHistoryQ,recentAttackQ])if(q.error)throw q.error
  const players=playersQ.data||[]
  if((availabilityQ.data||[]).length<players.length)throw new Error("AVAILABILITY_COVERAGE_INCOMPLETE")
  if((teamStatsQ.data||[]).length!==18)throw new Error("TEAM_STATS_INCOMPLETE")
  if(!(fixturesQ.data||[]).length)throw new Error("TARGET_FIXTURES_MISSING")

  const official=officialMatchEvidence(officialQ.data||[],players)
  const targetKickoff=(fixturesQ.data||[])[0]?.kickoff_at||new Date().toISOString()
  const teamKickoffs=new Map<number,string>()
  for(const match of fixturesQ.data||[]){
    for(const team of [Number(match.home_team_id),Number(match.away_team_id)]){
      if(!teamKickoffs.has(team))teamKickoffs.set(team,match.kickoff_at)
    }
  }
  const roleMap=new Map((rolesQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const avMap=new Map((availabilityQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const statsMap=new Map((statsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const teamStats=new Map((teamStatsQ.data||[]).map((x:any)=>[Number(x.team_id),x]))
  const priorMap=new Map((priorInputsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const teamNames=new Map((teamsQ.data||[]).map((x:any)=>[Number(x.id),x.name]))
  const projMap=new Map((currentProjQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const tacticalEvidence=new Map<number,any[]>()
  for(const obs of tacticalQ.data||[]){
    const id=Number(obs.player_id)
    if(!tacticalEvidence.has(id))tacticalEvidence.set(id,[])
    tacticalEvidence.get(id)!.push(obs)
  }
  const recentAdvanced=groupRecentAttack(recentAttackQ.data?.advanced||[])
  const recentVerified=groupRecentAttack(recentAttackQ.data?.verified||[])
  const recent=new Map<number,any[]>()
  for(const w of weeklyQ.data||[]){
    const id=Number(w.player_id);if(!recent.has(id))recent.set(id,[]);recent.get(id)!.push(w)
  }
  const teamFixtures=new Map<number,any[]>()
  const targetSuspensionFixtures=new Map<number,string>()
  const matchInputs:any[]=[],matchPredictions:any[]=[]
  for(const fx of fixturesQ.data||[]){
    const hs=teamStats.get(Number(fx.home_team_id)),as=teamStats.get(Number(fx.away_team_id))
    if(!hs||!as)throw new Error("TEAM_STATS_MISSING_FOR_FIXTURE_"+fx.match_id)
    const baselineHome=matchupLambda(hs,as,true),baselineAway=matchupLambda(as,hs,false)
    const teamForm=applyTeamMatchForm({
      baselineHome,baselineAway,homeTeamId:Number(fx.home_team_id),
      awayTeamId:Number(fx.away_team_id),gameweek:target,matches:teamHistoryQ.data||[]
    })
    const hl=teamForm.homeLambda,al=teamForm.awayLambda,prob=matchPrediction(hl,al)
    matchInputs.push({
      gameweek:target,benchmark_version:benchmark,match_id:Number(fx.match_id),
      home_team_id:Number(fx.home_team_id),away_team_id:Number(fx.away_team_id),
      home_lambda:hl,away_lambda:al,source_note:key+" • team xG/xGA + observed finishing/conceding blend"+
        (teamForm.applied?" • verified-team-form-v2":"")
    })
    matchPredictions.push({
      run_id:runId,match_id:Number(fx.match_id),gameweek:target,kickoff_at:fx.kickoff_at,
      home_team_id:Number(fx.home_team_id),away_team_id:Number(fx.away_team_id),
      home_xg:hl,away_xg:al,...prob,method:"weekly-auto-v1",
      model_note:"Geçen hafta kapanışından sonra güncel takım xG/xGA ve gerçekleşen bitiricilik/savunma profiliyle üretildi."
    })
    // A suspension source row is sourced against the *current* week.
    // Preserve the ban, but display the candidate week's actual opponent.
    const localDateParts=new Intl.DateTimeFormat("en-GB",{
      timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",year:"numeric"
    }).formatToParts(new Date(fx.kickoff_at))
    const part=(key:string)=>localDateParts.find((p:any)=>p.type===key)?.value||""
    const localDate=part("day")+"."+part("month")+"."+part("year")
    const fixtureLabel=localDate+" • "+
      (teamNames.get(Number(fx.home_team_id))||"—")+" - "+
      (teamNames.get(Number(fx.away_team_id))||"—")
    // If a future double gameweek has two matches, the earliest fixture is
    // the one a one-match suspension applies to.
    if(!targetSuspensionFixtures.has(Number(fx.home_team_id)))
      targetSuspensionFixtures.set(Number(fx.home_team_id),fixtureLabel)
    if(!targetSuspensionFixtures.has(Number(fx.away_team_id)))
      targetSuspensionFixtures.set(Number(fx.away_team_id),fixtureLabel)

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
    // Independently calculated MH8 0-minute entries can mean "not in
    // source", not verified DNP. Never teach role/bench probabilities
    // that they are real zero-minute appearances.
    const trustedRows=rows.filter(x=>trustedMinute(x)!==null)
    let durations=trustedRows.map(x=>n(x.minutes)).filter(x=>x>0).map(x=>clamp(1,90,x))
    if(!durations.length)durations=(prior.durations||[]).map((x:any)=>clamp(1,90,n(x))).filter((x:number)=>x>0)
    if(!durations.length)durations=[p.position==="GK"?90:70]
    durations=durations.slice(0,5)
    let durationWeights=normalizedWeights(durations.length)
    const recentMinuteRate=trustedRows.length?clamp(0,1,avg(trustedRows.slice(0,3).map(x=>n(x.minutes)/90))):n(prior.role_probability,n(r.predicted_xi_probability,.5))
    let roleProb=clamp(.01,.995,.65*n(r.predicted_xi_probability,n(prior.role_probability,.5))+.35*recentMinuteRate)
    // Existing minute weighting already gives recent games credit. Add only
    // a small residual uplift for a *sustained*, independently evidenced rise.
    const momentum=risingMinutesMomentum(rows,target,n(av.availability_probability,1))
    if(momentum.rising)roleProb=clamp(.01,.995,roleProb+momentum.role_uplift)
    const event=official.latest.get(id)
    const officialShift=applyOfficialMinutesEvidence({
      baseline:roleProb,durations,durationWeights,
      fixtureKickoff:teamKickoffs.get(Number(p.team_id))||targetKickoff,
      evidence:event,sameSlotStarter:event?official.directCompetitor(p,event):false,
      availability:n(av.availability_probability,1)
    })
    if(officialShift.applied){
      roleProb=officialShift.role;durations=officialShift.durations
      durationWeights=officialShift.duration_weights
    }
    const tactical=currentTacticalRole({
      baseRole:p.primary_role,baseSide:p.role_side,evidence:tacticalEvidence.get(id)||[],targetWeek:target
    })
    const minutes=Math.max(0,n(s.minutes))
    const priorRates=(prior.rates||[]).map(Number)
    const xg90=per90(s.xg_total,minutes,n(priorRates[0]))
    const g90=per90(s.goals,minutes,n(priorRates[1]))
    const a90=per90(s.assists,minutes,n(priorRates[2]))
    const xaRaw=firstRecordedRate(s.xa_per90,s.xa_model_per90,prior.effective_xa_per90,priorRates[3])
    const xaReconcile=reconcileDefenderXa(s,p,rows.find(x=>Number(x.gameweek)===target-1),xaRaw)
    const xa90=xaReconcile.rate
    const yc90=per90(s.yellow_cards,minutes,n(priorRates[4]))
    const rc90=per90(s.red_cards,minutes,n(priorRates[5]))
    const saves90=per90(s.saves,minutes,n(priorRates[6]))
    const shots90=per90(s.shots,minutes,n(priorRates[10]))
    const sot90=per90(s.shots_on_target,minutes,n(priorRates[11]))
    const calibrated=calibrateAttackRates({
      position:p.position,role:tactical.role,seasonMinutes:minutes,
      seasonWeek:s.through_gameweek==null?null:Number(s.through_gameweek),
      advancedWeek:s.advanced_through_gameweek==null?null:Number(s.advanced_through_gameweek),
      shots:s.shots==null?null:Number(s.shots),keyPasses:s.key_passes==null?null:Number(s.key_passes),
      xgPer90:xg90,goalsPer90:g90,xaPer90:xa90,assistsPer90:a90
    })
    const trustedAdvanced=Number(s.advanced_through_gameweek)>=target-2
    const form=recentAttackForm({
      position:p.position,targetWeek:target,cutoffAt:targetKickoff,weekly:rows,
      advanced:recentAdvanced.get(id)||[],verified:recentVerified.get(id)||[],
      seasonShotsPer90:trustedAdvanced?shots90:null,
      seasonKeyPassesPer90:trustedAdvanced&&minutes>0&&s.key_passes!=null
        ?90*n(s.key_passes)/minutes:null,
      xgPer90:calibrated.xgPer90,xaPer90:calibrated.xaPer90
    })
    // New evidence channels are explicitly missing (-1) unless a complete,
    // same-gameweek season stats window exists. Never misread absent
    // provider actions as verified zero opportunities.
    const opportunityAligned=minutes>=270&&s.advanced_through_gameweek!=null&&
      s.through_gameweek!=null&&Number(s.advanced_through_gameweek)===Number(s.through_gameweek)
    const keyPass90=opportunityAligned&&s.key_passes!=null
      ?90*n(s.key_passes)/minutes:-1
    const trustedShots90=opportunityAligned&&s.shots!=null?90*n(s.shots)/minutes:-1
    const rates=[form.xgPer90,calibrated.goalsPer90,a90,form.xaPer90,
      yc90,rc90,saves90,n(priorRates[7]),n(priorRates[8]),n(priorRates[9]),shots90,sot90,
      keyPass90,trustedShots90]
    const availability=clamp(0,1,n(av.availability_probability,1))
    inputRows.push({
      gameweek:target,benchmark_version:benchmark,player_id:id,player_name:p.full_name,club_id:Number(p.team_id),
      position:p.position,price:n(p.price),availability,role_probability:roleProb,
      bench_weight:n(prior.bench_weight,1),durations,duration_weights:durationWeights,rates,
      data_confidence:prior.data_confidence||projMap.get(id)?.confidence||"medium",
      has_individual_prior:Boolean(prior.has_individual_prior),
      source_note:key+(calibrated.applied?" • role-aware-attack-v1":"")+(form.applied?" • recent-attack-form-v2":"")+(tactical.changed?" • tactical-role-evidence-v1":"")+(momentum.rising?" • momentum-v1 +"+momentum.role_uplift:"")+(xaReconcile.adjusted?" • defender-xa-source-window-v1 "+xaReconcile.source_minutes+"dk":"")+(officialShift.applied?" • resmî maç: "+event.match_ref:""),
      sub_role:tactical.role||prior.sub_role||null,role_side:tactical.side||prior.role_side||null,
      effective_xa_per90:form.xaPer90
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
    const {last2Min,prev2Min,last2Xi,prev2Xi,trend:d}=roleTrendFromWeeklyEvidence(rows,target)
    const signal=officialShift.applied&&event.started&&Number(event.minutes)>=75
      ?"RESMÎ MAÇTA İLK 11":officialShift.applied&&event.squad_status==="unused"
      ?"RESMÎ MAÇTA YEDEK":momentum.rising?momentum.signal:d!==null&&d>.20?"ROL YÜKSELİYOR":d!==null&&d<-.20?"ROL DÜŞÜYOR":"BELİRGİN DEĞİŞİM YOK"
    const {goal:goalWeight,assist:assistWeight}=credibleAttackWeights(
      p.position,tactical.role,rates)
    roleDraft.push({run_id:runId,player_id:id,last2_xi_probability:last2Xi,previous2_xi_probability:prev2Xi,last2_minutes:last2Min,previous2_minutes:prev2Min,signal,predicted_xi_probability:roleProb,x_minutes:0,availability_probability:availability,goalWeight,assistWeight,team_id:Number(p.team_id)})
    if(!weightsByTeam.has(Number(p.team_id)))weightsByTeam.set(Number(p.team_id),[])
    weightsByTeam.get(Number(p.team_id))!.push({id,goal:goalWeight,assist:assistWeight,available:availability})
    const {run_id:_,...copy}=av
    availabilityRows.push({
      ...copy,run_id:runId,
      ...(av.availability_type==="suspensions"
        ? {suspension_fixture:targetSuspensionFixtures.get(Number(p.team_id))||null}
        : {}),
    })
  }
  const roleRows=roleDraft.map(x=>{
    const peers=(weightsByTeam.get(x.team_id)||[]).filter(z=>z.available>0)
    const goalSum=peers.reduce((s,z)=>s+z.goal,0)||1,assistSum=peers.reduce((s,z)=>s+z.assist,0)||1
    const me=peers.find(z=>z.id===x.player_id)
    const {goalWeight,assistWeight,team_id,...row}=x
    return {...row,team_goal_share:me?me.goal/goalSum:0,team_assist_share:me?me.assist/assistSum:0}
  })

  const preparationQA=auditMatchAllocation({
    gameweek:target,fixtures:fixturesQ.data||[],matchInputs,
    playerInputs:inputRows,roleShares:roleRows
  })
  if(!preparationQA.pass)throw new Error("TEAM_PLAYER_PREP_QA_FAILED: "+preparationQA.failures.join(","))
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
  const inputHash=await snapshotHash({
    gameweek:target,benchmark,
    players:inputRows.map((x:any)=>[x.player_id,x.club_id,x.position,x.price,x.availability,x.role_probability,x.durations,x.duration_weights,x.rates,x.sub_role,x.role_side]),
    matches:matchInputs.map((x:any)=>[x.match_id,x.home_team_id,x.away_team_id,x.home_lambda,x.away_lambda])
  })
  const metaUpdate=await sb.from("scout_model_runs").update({
    input_snapshot_hash:inputHash,source_cutoff:status.latest_source_at,code_sha:codeSha,config_version:configVersion
  }).eq("id",runId)
  if(metaUpdate.error)throw metaUpdate.error
  await linkLifecycle(sb,current,target,runId,benchmark,key,status)
  return {reused:false,run_id:runId,gameweek:target,benchmark,players:inputRows.length,matches:matchInputs.length,key}
}


async function prepareCurrentRefresh(sb:any,current:any,body:any={}){
  const gw=Number(current.gameweek)
  const now=Date.now()
  const kickoffQ=await sb.from("scout_match_predictions")
    .select("kickoff_at").eq("run_id",current.id).order("kickoff_at",{ascending:true}).limit(1).maybeSingle()
  if(kickoffQ.error)throw kickoffQ.error
  const kickoff=kickoffQ.data?.kickoff_at?new Date(kickoffQ.data.kickoff_at).getTime():NaN
  if(!Number.isFinite(kickoff))return {refresh_required:false,reason:"CURRENT_KICKOFF_MISSING"}
  // A gameweek cannot keep producing *pre-match* 50K forecasts forever simply
  // because the official result/closure ingestion is missing. Continue rolling
  // updates throughout the gameweek, but stop three hours after the LAST
  // scheduled kickoff (normal final whistle plus reasonable match delays).
  // SourceStatus continues to require independently confirmed actuals AND a
  // complete next-week fixture before advancing. Never invent results.
  const lastKickoffQ=await sb.from("scout_match_predictions")
    .select("kickoff_at").eq("run_id",current.id)
    .order("kickoff_at",{ascending:false}).limit(1).maybeSingle()
  if(lastKickoffQ.error)throw lastKickoffQ.error
  const lastKickoff=lastKickoffQ.data?.kickoff_at
    ?new Date(lastKickoffQ.data.kickoff_at).getTime():NaN
  if(!Number.isFinite(lastKickoff))
    return {refresh_required:false,reason:"CURRENT_LAST_KICKOFF_MISSING",gameweek:gw}
  if(now>=lastKickoff+3*36e5){
    return {
      refresh_required:false,reason:"LAST_FIXTURE_WINDOW_ENDED_AWAITING_RESULTS",
      gameweek:gw,last_kickoff_at:new Date(lastKickoff).toISOString(),
      source_closure_required:true,next_gameweek:gw+1
    }
  }
  // A completed set of sourced football results ends the forecasting window,
  // even if kickoff+3h has not elapsed. Fantasy actuals remain a separate gate.
  const finishedQ=await sb.from("scout_match_history")
    .select("match_id,match_status,home_goals,away_goals")
    .eq("season","2026-27").eq("gameweek",gw)
  if(finishedQ.error)throw finishedQ.error
  if((finishedQ.data||[]).length===9&&
     (finishedQ.data||[]).every((m:any)=>m.match_status==="Bitti"&&
       m.home_goals!==null&&m.away_goals!==null)){
    return {refresh_required:false,
      reason:"ALL_FOOTBALL_RESULTS_FINAL_AWAITING_FANTASY_ACTUALS",
      gameweek:gw,source_closure_required:true,next_gameweek:gw+1}
  }
  const deadline=kickoff-36e5
  // Squad editing remains locked at the official deadline, but forecast *views*
  // can evolve while the gameweek is in progress. Before ANY post-kickoff
  // recomputation, require the immutable pre-first-kickoff backtest snapshot.
  // Its snapshot table must never be updated by later rolling forecast runs.
  const frozenQ=await sb.from("scout_backtest_weeks")
    .select("run_id,snapshot_at,prediction_mode,status,prediction_count")
    .eq("gameweek",gw).maybeSingle()
  if(frozenQ.error)throw frozenQ.error
  const frozen=frozenQ.data
  const hasFrozen=Boolean(frozen?.run_id)
  // Once published, preserve the original pre-kickoff forecast forever.
  // Later model improvements may refresh current public predictions, but must
  // never overwrite the immutable baseline used for honest MH9 backtests.
  const snapshotAllowed=now<kickoff&&!hasFrozen
  if(hasFrozen||now>=kickoff){
    if(!hasFrozen||frozen.prediction_mode!=="live_frozen"||
       !(new Date(frozen.snapshot_at).getTime()<kickoff)||
       Number(frozen.prediction_count||0)<1||
       !["open","closed"].includes(String(frozen.status||"")))
      throw new Error("PRE_KICKOFF_BACKTEST_SNAPSHOT_REQUIRED")
  }

  const [latestMetaQ,stableMetaQ,availabilityQ,rolesQ,goalConfigQ,playersUpdatedQ,currentProjectionQ,officialQ,playersQ,teamFixturesQ,attackSourceQ,tacticalQ,teamHistoryQ,recentAttackQ]=await Promise.all([
    sb.from("scout_replay_input_meta").select("*").eq("gameweek",gw)
      .lt("created_at",new Date(kickoff).toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("scout_replay_input_meta").select("benchmark_version").eq("gameweek",gw)
      .lt("created_at",new Date(kickoff).toISOString()).not("benchmark_version","ilike","intraday-%")
      .order("created_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("scout_availability").select("*").eq("run_id",current.id),
    sb.from("scout_role_signals").select("*").eq("run_id",current.id),
    sb.from("scout_goal_distribution_config").select("version,alpha_used,gate_benchmark").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("scout_players").select("updated_at").eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("scout_player_projections").select("player_id,opponent_name,venue,confidence,data_confidence").eq("run_id",current.id),
    officialEvidenceQuery(sb),
    sb.from("scout_players").select("id,team_id,position,primary_role,role_side").eq("active",true),
    sb.from("scout_match_predictions").select("*")
      .eq("run_id",current.id).order("kickoff_at",{ascending:true}),
    sb.from("scout_verified_weekly_attack").select("player_id,gameweek,xg,xa,observed_at")
      .eq("season","2026-27").eq("gameweek",gw-1),
    sb.from("scout_player_tactical_role_observations")
      .select("player_id,gameweek,role,side,minutes,started,verified,observed_at")
      .eq("season","2026-27").gte("gameweek",Math.max(1,gw-3)).lt("gameweek",gw)
      .eq("verified",true),
    sb.from("scout_match_history").select("gameweek,home_team_id,away_team_id,home_goals,away_goals,match_status,fantasy_closure")
      .eq("season","2026-27").gte("gameweek",Math.max(1,gw-8)).lt("gameweek",gw),
    fetchRecentAttackEvidence(sb,gw)
  ])
  for(const q of [latestMetaQ,stableMetaQ,availabilityQ,rolesQ,goalConfigQ,playersUpdatedQ,currentProjectionQ,officialQ,playersQ,teamFixturesQ,attackSourceQ,tacticalQ,teamHistoryQ,recentAttackQ])if(q.error)throw q.error
  if(!latestMetaQ.data)return {refresh_required:false,reason:"CURRENT_SIM_INPUT_META_MISSING"}

  const availabilityTimes=(availabilityQ.data||[])
    .map((x:any)=>x.checked_at)
    .filter(Boolean)
    .map((value:any)=>new Date(value).getTime())
    .filter(Number.isFinite)
  const availabilityLatest=availabilityTimes.length
    ?new Date(Math.max(...availabilityTimes)).toISOString()
    :null
  const availabilityAge=ageHours(availabilityLatest)
  const availabilitySourceTimes=(availabilityQ.data||[])
    .map((x:any)=>x.detail_source_updated_at)
    .filter(Boolean)
    .map((value:any)=>new Date(value).getTime())
    .filter(Number.isFinite)
  const availabilitySourceLatest=availabilitySourceTimes.length
    ?new Date(Math.max(...availabilitySourceTimes)).toISOString()
    :availabilityLatest
  if(!availabilityLatest||availabilityAge>24){
    return {
      refresh_required:false,reason:"AVAILABILITY_STALE",
      availability_checked_at:availabilityLatest,availability_age_hours:availabilityAge,
      deadline_at:new Date(deadline).toISOString()
    }
  }
  const officialSourceLatest=(officialQ.data||[]).reduce(
    (stamp:any,e:any)=>newer(stamp,e.source_updated_at),null
  )
  const attackObservedAt=(attackSourceQ.data||[]).reduce((stamp:any,e:any)=>newer(stamp,e.observed_at),null)
  const roleObservedAt=(tacticalQ.data||[]).reduce((stamp:any,e:any)=>newer(stamp,e.observed_at),null)
  const latestSourceAt=new Date(newer(
    availabilitySourceLatest,playersUpdatedQ.data?.updated_at,
    current.source_updated_at,officialSourceLatest,attackObservedAt,roleObservedAt
  )).toISOString()
  const hoursUntilDeadline=Math.max(0,(deadline-now)/36e5)
  // During a live week, respond to real source changes no faster than every 2h.
  const minInterval=!snapshotAllowed?2:hoursUntilDeadline<=12?2:hoursUntilDeadline<=48?6:24
  const generatedAge=ageHours(current.generated_at)
  const codeSha=String(body.code_sha||"").trim()||null
  const configVersion=goalConfigQ.data?.version
    ?[goalConfigQ.data.version,goalConfigQ.data.alpha_used!=null?`alpha=${goalConfigQ.data.alpha_used}`:null,goalConfigQ.data.gate_benchmark||null].filter(Boolean).join('|')
    :null
  const sourceAdvanced=!current.source_updated_at||new Date(latestSourceAt).getTime()>new Date(current.source_updated_at).getTime()+60_000
  const configChanged=Boolean(configVersion)&&String(current.config_version||"")!==String(configVersion)
  const codeChanged=Boolean(codeSha)&&String(current.code_sha||"")!==String(codeSha)
  const structuralRefresh=configChanged||codeChanged
  if(!(sourceAdvanced||structuralRefresh)||(!structuralRefresh&&generatedAge<minInterval)){
    return {
      refresh_required:false,
      reason:!(sourceAdvanced||structuralRefresh)?"SOURCE_AND_MODEL_UNCHANGED":"REFRESH_INTERVAL_NOT_REACHED",
      latest_source_at:latestSourceAt,model_age_hours:generatedAge,min_interval_hours:minInterval,
      config_changed:configChanged,code_changed:codeChanged,
      deadline_at:new Date(deadline).toISOString()
    }
  }

  const sourceBenchmark=String(latestMetaQ.data.benchmark_version)
  const stableRoleBenchmark=String(stableMetaQ.data?.benchmark_version||sourceBenchmark)
  const [inputsQ,matchesQ,stableInputsQ,sourceStatsQ,weeklyRecentQ,stableMatchesQ]=await Promise.all([
    sb.from("scout_replay_player_inputs").select("*").eq("gameweek",gw).eq("benchmark_version",sourceBenchmark).order("player_id"),
    sb.from("scout_replay_match_inputs").select("*").eq("gameweek",gw).eq("benchmark_version",sourceBenchmark).order("match_id"),
    stableRoleBenchmark===sourceBenchmark
      ?Promise.resolve({data:null,error:null})
      :sb.from("scout_replay_player_inputs").select("player_id,role_probability,durations,duration_weights,source_note,rates").eq("gameweek",gw).eq("benchmark_version",stableRoleBenchmark).order("player_id"),
    sb.from("scout_player_season_stats").select("player_id,through_gameweek,advanced_through_gameweek,minutes,shots,key_passes,goals,assists,xg_total,xa_total,xa_per90,xa_model_per90,xa_source")
      .eq("season","2026-27").eq("through_gameweek",gw-1),
    fetchTrustedWeeklyEvidence(sb,gw),
    stableRoleBenchmark===sourceBenchmark
      ?Promise.resolve({data:null,error:null})
      :sb.from("scout_replay_match_inputs").select("*")
        .eq("gameweek",gw).eq("benchmark_version",stableRoleBenchmark).order("match_id")
  ])
  for(const q of [inputsQ,matchesQ,stableInputsQ,sourceStatsQ,weeklyRecentQ,stableMatchesQ])if(q.error)throw q.error
  if(!(inputsQ.data||[]).length||!(matchesQ.data||[]).length)throw new Error("CURRENT_SIM_INPUT_COVERAGE_MISSING")
  const stableInputsMap=new Map(((stableInputsQ.data||inputsQ.data)||[]).map((x:any)=>[Number(x.player_id),x]))
  const stableRoleMap=new Map([...stableInputsMap.entries()].map(([id,x]:any)=>[id,n(x.role_probability,.5)]))

  const revision=sourceRevision(latestSourceAt)
  const codeRevision=String(codeSha||"nocode").slice(0,8)
  const configRevision=String(goalConfigQ.data?.version||"noconfig").replace(/[^a-z0-9]+/gi,"-").slice(0,24)
  const benchmark=`intraday-mh${gw}-${revision}-${codeRevision}-${configRevision}-${String(current.id).slice(0,8)}`
  const existing=await sb.from("scout_model_runs")
    .select("id,status,input_snapshot_hash")
    .eq("gameweek",gw).eq("is_current",false)
    .ilike("notes","%"+benchmark+"%")
    .order("generated_at",{ascending:false}).limit(1).maybeSingle()
  if(existing.error)throw existing.error
  if(existing.data){
    return {
      refresh_required:true,reused:true,snapshot_allowed:snapshotAllowed,run_id:existing.data.id,parent_run_id:current.id,gameweek:gw,benchmark,
      latest_source_at:latestSourceAt,deadline_at:new Date(deadline).toISOString(),
      min_interval_hours:minInterval,input_snapshot_hash:existing.data.input_snapshot_hash||null
    }
  }
  const weeklyMomentumRows=new Map<number,any[]>()
  for(const w of weeklyRecentQ.data||[]){
    const id=Number(w.player_id)
    if(!weeklyMomentumRows.has(id))weeklyMomentumRows.set(id,[])
    weeklyMomentumRows.get(id)!.push(w)
  }
  const sourceStatsMap=new Map((sourceStatsQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const recentAdvanced=groupRecentAttack(recentAttackQ.data?.advanced||[])
  const recentVerified=groupRecentAttack(recentAttackQ.data?.verified||[])
  const attackEvidence=new Map((attackSourceQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const tacticalEvidence=new Map<number,any[]>()
  for(const obs of tacticalQ.data||[]){
    const id=Number(obs.player_id)
    if(!tacticalEvidence.has(id))tacticalEvidence.set(id,[])
    tacticalEvidence.get(id)!.push(obs)
  }
  const avMap=new Map((availabilityQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const roleMap=new Map((rolesQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const projectionMap=new Map((currentProjectionQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
  const official=officialMatchEvidence(officialQ.data||[],playersQ.data||[])
  const officialPlayers=new Map((playersQ.data||[]).map((p:any)=>[Number(p.id),p]))
  const targetKickoffs=new Map<number,string>()
  for(const match of teamFixturesQ.data||[]){
    for(const team of [Number(match.home_team_id),Number(match.away_team_id)]){
      if(!targetKickoffs.has(team))targetKickoffs.set(team,match.kickoff_at)
    }
  }

  const inputRows=(inputsQ.data||[]).map((x:any)=>{
    const av=avMap.get(Number(x.player_id))
    const availability=clamp(0,1,n(av?.availability_probability,x.availability))
    // Feedback guard: role_probability is a conditional lineup-selection weight, not the simulated XI result.
    // Re-feeding the previous simulated XI into the next intraday run recursively flattens
    // starters and inflates bench players on every refresh. Always anchor this weight to the
    // latest non-intraday baseline; availability remains a separate multiplier in simulation.
    const stableRole=n(stableRoleMap.get(Number(x.player_id)),n(x.role_probability,.5))
    const stableInput=stableInputsMap.get(Number(x.player_id)) as any || x
    const event=official.latest.get(Number(x.player_id))
    const player=officialPlayers.get(Number(x.player_id))
    const tactical=currentTacticalRole({
      baseRole:player?.primary_role||x.sub_role,baseSide:player?.role_side||x.role_side,
      evidence:tacticalEvidence.get(Number(x.player_id))||[],targetWeek:gw
    })
    const momentum=risingMinutesMomentum(weeklyMomentumRows.get(Number(x.player_id))||[],gw,availability)
    // Never add the same rise twice: non-intraday inputs may already include it.
    const momentumBoost=String(stableInput.source_note||"").includes("momentum-v1")
      ?0:momentum.role_uplift
    const adjusted=applyOfficialMinutesEvidence({
      baseline:clamp(.01,.995,stableRole+momentumBoost),durations:stableInput.durations,durationWeights:stableInput.duration_weights,
      fixtureKickoff:targetKickoffs.get(Number(x.club_id))||new Date(kickoff).toISOString(),evidence:event,
      sameSlotStarter:player&&event?official.directCompetitor(player,event):false,
      availability,
    })
    const rates=(x.rates||[]).map(Number)
    const stableRates=Array.isArray(stableInput.rates)?stableInput.rates.map(Number):rates
    const stats=sourceStatsMap.get(Number(x.player_id)) as any
    // Use the same aligned source policy in weekly and intraday passes.
    // Retain original stats fields; only the candidate rate is changed.
    const rateRaw=stats?firstRecordedRate(stats.xa_per90,stats.xa_model_per90,rates[3]):rates[3]
    const xaReconcile=reconcileDefenderXa(stats,player,
      (weeklyMomentumRows.get(Number(x.player_id))||[]).find((w:any)=>Number(w.gameweek)===gw-1),
      rateRaw)
    rates[3]=xaReconcile.rate // safeguard existing defender source reconciliation
    // MH8 is a single observed fixture, not a season snapshot. Mix only
    // present numeric evidence into the non-intraday baseline with heavy
    // shrinkage; missing xG/xA remains unknown and does not become zero.
    const mh8=attackEvidence.get(Number(x.player_id)) as any
    const history=(weeklyMomentumRows.get(Number(x.player_id))||[])
      .find((w:any)=>Number(w.gameweek)===gw-1)
    const observedMinutes=history?trustedMinute(history):null
    const xgUpdate=blendVerifiedAttackRate(n(stableRates[0],rates[0]),mh8?.xg,observedMinutes,"xg")
    const xaUpdate=blendVerifiedAttackRate(xaReconcile.rate,mh8?.xa,observedMinutes,"xa")
    // Always anchor to the stable, non-intraday input. Otherwise a second
    // refresh recursively discounts the same historical xG again.
    // Forecast priors are always grounded in the untouched stable baseline;
    // MH8 observations can refresh rates but must not compound an earlier shrink.
    const alreadyCalibrated=String(stableInput.source_note||"").includes("role-aware-attack-v1")
    const calibrated=alreadyCalibrated
      ?{xgPer90:xgUpdate.rate,goalsPer90:n(stableRates[1],rates[1]),xaPer90:xaUpdate.rate,applied:false}
      :calibrateAttackRates({
        position:player?.position||x.position,role:tactical.role,
        seasonMinutes:stats?.minutes==null?null:Number(stats.minutes),
        seasonWeek:stats?.through_gameweek==null?null:Number(stats.through_gameweek),
        advancedWeek:stats?.advanced_through_gameweek==null?null:Number(stats.advanced_through_gameweek),
        shots:stats?.shots==null?null:Number(stats.shots),
        keyPasses:stats?.key_passes==null?null:Number(stats.key_passes),
        xgPer90:xgUpdate.rate,goalsPer90:n(stableRates[1],rates[1]),
        xaPer90:xaUpdate.rate,assistsPer90:n(stableRates[2],rates[2])
      })
    const seasonMins=Number(stats?.minutes||0)
    const trustedAdvanced=Number(stats?.advanced_through_gameweek)>=gw-2
    const form=String(stableInput.source_note||"").includes("recent-attack-form-v2")
      ?{xgPer90:calibrated.xgPer90,xaPer90:calibrated.xaPer90,applied:false}
      :recentAttackForm({
        position:player?.position||x.position,targetWeek:gw,cutoffAt:kickoff,
        weekly:weeklyMomentumRows.get(Number(x.player_id))||[],
        advanced:recentAdvanced.get(Number(x.player_id))||[],
        verified:recentVerified.get(Number(x.player_id))||[],
        seasonShotsPer90:trustedAdvanced?n(stableRates[10],0):null,
        seasonKeyPassesPer90:trustedAdvanced&&seasonMins>0&&stats?.key_passes!=null
          ?90*Number(stats.key_passes)/seasonMins:null,
        xgPer90:calibrated.xgPer90,xaPer90:calibrated.xaPer90
      })
    rates[0]=form.xgPer90
    rates[1]=calibrated.goalsPer90
    rates[3]=form.xaPer90
    // Rebuild from current SOURCE season stats, not recursively from the
    // previous simulation. Mark unavailable/stale actions as unknown.
    const alignedOpportunity=seasonMins>=270&&stats?.advanced_through_gameweek!=null&&
      stats?.through_gameweek!=null&&Number(stats.advanced_through_gameweek)===Number(stats.through_gameweek)
    rates[12]=alignedOpportunity&&stats?.key_passes!=null?90*Number(stats.key_passes)/seasonMins:-1
    rates[13]=alignedOpportunity&&stats?.shots!=null?90*Number(stats.shots)/seasonMins:-1
    return {
      ...x,benchmark_version:benchmark,availability,rates,
      sub_role:tactical.role||x.sub_role,role_side:tactical.side||x.role_side,
      role_probability:adjusted.role,
      effective_xa_per90:rates[3],
      durations:adjusted.applied?adjusted.durations:x.durations,
      duration_weights:adjusted.applied?adjusted.duration_weights:x.duration_weights,
      source_note:`intraday refresh from ${sourceBenchmark}; role baseline ${stableRoleBenchmark}; source ${latestSourceAt}`
        +(momentum.rising?` • momentum-v1 +${momentumBoost}`:"")
        +(xaReconcile.adjusted?` • defender-xa-source-window-v1 ${xaReconcile.source_minutes}dk`:"")
        +(xgUpdate.applied||xaUpdate.applied?` • mh8-attack-source-v1 ${xgUpdate.applied?"xg":""}${xaUpdate.applied?"+xa":""}`:"")
        +(calibrated.applied||alreadyCalibrated?` • role-aware-attack-v1`:"")
        +(form.applied||String(stableInput.source_note||"").includes("recent-attack-form-v2")?` • recent-attack-form-v2`:"")
        +(tactical.changed?` • tactical-role-evidence-v1`:"")
        +(adjusted.applied?` • resmî maç: ${event.match_ref}`:"")
    }
  })
  const runId=crypto.randomUUID()
  const anchoredMatchInputs=new Map(((stableMatchesQ.data||matchesQ.data)||[]).map((x:any)=>[Number(x.match_id),x]))
  // Anchored non-intraday match lambdas prevent the same form boost
  // compounding on hourly/current-gameweek refreshes.
  const matchInputs=(matchesQ.data||[]).map((x:any)=>{
    const stable=anchoredMatchInputs.get(Number(x.match_id)) as any || x
    const factor=recalibrateAnchoredMatchForm({
      stableHome:Number(stable.home_lambda),stableAway:Number(stable.away_lambda),
      sourceNote:stable.source_note,
      homeTeamId:Number(x.home_team_id),awayTeamId:Number(x.away_team_id),
      gameweek:gw,matches:teamHistoryQ.data||[]
    })
    return {...x,benchmark_version:benchmark,
      home_lambda:factor.homeLambda,away_lambda:factor.awayLambda,
      source_note:`intraday refresh from ${stableRoleBenchmark}`+
        (factor.version==="v2"||factor.applied?" • verified-team-form-v2":"")}
  })
  const computedMatches=new Map(matchInputs.map((m:any)=>[Number(m.match_id),m]))
  const matchPredictions=(teamFixturesQ.data||[]).map((m:any)=>{
    const input=computedMatches.get(Number(m.match_id)) as any
    if(!input)throw new Error("MATCH_PREDICTION_INPUT_NOT_FOUND_"+m.match_id)
    const {run_id:_,...prior}=m
    return {...prior,run_id:runId,
      home_xg:input.home_lambda,away_xg:input.away_lambda,
      ...matchPrediction(Number(input.home_lambda),Number(input.away_lambda)),
      method:"weekly-auto-team-form-v2",
      model_note:"Kaynaklı son üç maç gol atma/yeme formu + sezon xG/xGA (ölçülü düzeltme)."}
  })
  const meta={...latestMetaQ.data,benchmark_version:benchmark,created_at:new Date().toISOString(),source_note:`intraday refresh from ${sourceBenchmark}; source ${latestSourceAt}`}
  delete (meta as any).id

  const runInsert=await sb.from("scout_model_runs").insert({
    id:runId,gameweek:gw,model_version:current.model_version,generated_at:new Date().toISOString(),
    source_updated_at:latestSourceAt,source_cutoff:latestSourceAt,simulation_count:0,status:"building",is_current:false,
    notes:`intraday ${snapshotAllowed?"pre-kickoff":"in-week rolling"} refresh • ${benchmark} • parent ${current.id} • source ${latestSourceAt}`,
    code_sha:codeSha,config_version:configVersion
  })
  if(runInsert.error)throw runInsert.error

  const projectionRows=inputRows.map((x:any)=>{
    const previous=projectionMap.get(Number(x.player_id))||{}
    return {
      run_id:runId,player_id:Number(x.player_id),opponent_name:previous.opponent_name||"—",venue:previous.venue||"HOME",
      xi_probability:0,appearance_probability:0,over60_probability:0,x_minutes:0,
      core_xfp:0,x_bonus:0,xfp:0,p25:0,p75:0,p90:0,six_plus_probability:0,value_score:0,
      data_confidence:previous.data_confidence||x.data_confidence||"medium",role_note:null,expected_goals:0,expected_assists:0,
      mc_standard_error:0,availability_source:"intraday-refresh",availability_probability:n(x.availability,1),
      top25_score:null,top25_rank:null,top25_model_version:null,confidence:previous.confidence||x.data_confidence||"medium"
    }
  })
  const availabilityRows=(availabilityQ.data||[]).map((x:any)=>{const {run_id:_,...rest}=x;return {...rest,run_id:runId}})
  const teamByPlayer=new Map((inputRows||[]).map((x:any)=>[Number(x.player_id),Number(x.club_id)]))
  const refreshedInputs=new Map(inputRows.map((x:any)=>[Number(x.player_id),x]))
  const roleBase=(rolesQ.data||[]).map((x:any)=>{
    const {run_id:_,...rest}=x
    const av=avMap.get(Number(x.player_id))
    const input=refreshedInputs.get(Number(x.player_id)) as any
    const history=weeklyMomentumRows.get(Number(x.player_id))||[]
    const trend=roleTrendFromWeeklyEvidence(history,gw)
    return {
      ...rest,run_id:runId,
      predicted_xi_probability:n((refreshedInputs.get(Number(x.player_id)) as any)?.role_probability,x.predicted_xi_probability),
      last2_xi_probability:trend.last2Xi,
      previous2_xi_probability:trend.prev2Xi,
      last2_minutes:trend.last2Min,
      previous2_minutes:trend.prev2Min,
      signal:(()=>{
        const event=official.latest.get(Number(x.player_id))
        const used=event&&String(input?.source_note||"").includes(String(event.match_ref))
        const momentum=risingMinutesMomentum(
          history,gw,
          n(av?.availability_probability,1))
        return used&&event.started&&Number(event.minutes)>=75?"RESMÎ MAÇTA İLK 11"
          :used&&event.squad_status==="unused"?"RESMÎ MAÇTA YEDEK"
          :momentum.rising?momentum.signal
          :trend.trend!==null&&trend.trend>.20?"ROL YÜKSELİYOR"
          :trend.trend!==null&&trend.trend<-.20?"ROL DÜŞÜYOR"
          :"BELİRGİN DEĞİŞİM YOK"
      })(),
      availability_probability:clamp(0,1,n(av?.availability_probability,x.availability_probability)),
      team_goal_share:credibleAttackWeights(input?.position,input?.sub_role,input?.rates||[]).goal,
      team_assist_share:credibleAttackWeights(input?.position,input?.sub_role,input?.rates||[]).assist,
      team_id:teamByPlayer.get(Number(x.player_id))
    }
  })
  const shareTotals=new Map<number,{goal:number,assist:number}>()
  for(const row of roleBase){
    if(!(row.availability_probability>0)||!Number.isFinite(row.team_id))continue
    const total=shareTotals.get(row.team_id)||{goal:0,assist:0}
    total.goal+=Math.max(0,n(row.team_goal_share))
    total.assist+=Math.max(0,n(row.team_assist_share))
    shareTotals.set(row.team_id,total)
  }
  const roleRows=roleBase.map((x:any)=>{
    const {team_id,...row}=x
    if(!(x.availability_probability>0))return {...row,team_goal_share:0,team_assist_share:0}
    const total=shareTotals.get(team_id)||{goal:0,assist:0}
    return {
      ...row,
      team_goal_share:total.goal>0?Math.max(0,n(x.team_goal_share))/total.goal:0,
      team_assist_share:total.assist>0?Math.max(0,n(x.team_assist_share))/total.assist:0
    }
  })

  const intradayQA=auditMatchAllocation({
    gameweek:gw,fixtures:teamFixturesQ.data||[],matchInputs,
    playerInputs:inputRows,roleShares:roleRows
  })
  if(!intradayQA.pass)throw new Error("INTRADAY_TEAM_PLAYER_QA_FAILED: "+intradayQA.failures.join(","))
  for(const [table,rows] of [
    ["scout_replay_input_meta",[meta]],["scout_replay_match_inputs",matchInputs],["scout_replay_player_inputs",inputRows],
    ["scout_match_predictions",matchPredictions],
    ["scout_availability",availabilityRows],["scout_player_projections",projectionRows],
    ["scout_role_signals",roleRows]
  ] as any[]){
    const ins=await sb.from(table).insert(rows)
    if(ins.error)throw new Error(table+": "+ins.error.message)
  }
  const inputHash=await snapshotHash({
    gameweek:gw,benchmark,
    players:inputRows.map((x:any)=>[x.player_id,x.club_id,x.position,x.price,x.availability,x.role_probability,x.durations,x.duration_weights,x.rates,x.sub_role,x.role_side]),
    matches:matchInputs.map((x:any)=>[x.match_id,x.home_team_id,x.away_team_id,x.home_lambda,x.away_lambda])
  })
  const runUpdate=await sb.from("scout_model_runs").update({input_snapshot_hash:inputHash}).eq("id",runId)
  if(runUpdate.error)throw runUpdate.error
  return {
    refresh_required:true,snapshot_allowed:snapshotAllowed,run_id:runId,parent_run_id:current.id,gameweek:gw,benchmark,
    latest_source_at:latestSourceAt,deadline_at:new Date(deadline).toISOString(),
    min_interval_hours:minInterval,input_snapshot_hash:inputHash
  }
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

    if(action==="diagnose_backtest"){
      // Protected, read-only, no historical rewriting and no automatic tuning.
      // Include only completed live_frozen PRE-KICKOFF snapshots, never the
      // rolling current run, training replay, or incomplete actuals.
      const weeksQ=await sb.from("scout_backtest_weeks")
        .select("gameweek,prediction_mode,status,snapshot_at,prediction_count,actual_count")
        .eq("status","closed").eq("prediction_mode","live_frozen")
        .order("gameweek",{ascending:false}).limit(8)
      if(weeksQ.error)throw weeksQ.error
      const weeks=weeksQ.data||[]
      if(!weeks.length)return Response.json({ok:true,closed_weeks:[],sample:0,no_writes:true})
      const weekIds=weeks.map((w:any)=>Number(w.gameweek))
      async function getAll(table:string,columns:string,build:(q:any)=>any){
        const all:any[]=[]
        for(let offset=0;offset<15000;offset+=500){
          const query=build(sb.from(table).select(columns)).range(offset,offset+499)
          const result=await query
          if(result.error)throw result.error
          const batch=result.data||[]
          all.push(...batch)
          if(batch.length<500)return all
        }
        throw new Error("FROZEN_BACKTEST_PAGINATION_LIMIT")
      }
      const [players,positions,weeklyPositions]=await Promise.all([
        getAll("scout_backtest_players",
          "gameweek,player_id,prediction_mode,predicted_xfp,actual_points,predicted_minutes,actual_minutes,six_plus_probability",
          q=>q.in("gameweek",weekIds).eq("prediction_mode","live_frozen")
            .not("actual_points","is",null).order("gameweek").order("player_id")),
        getAll("scout_players","id,position",q=>q.order("id")),
        getAll("scout_player_weekly_points","gameweek,player_id,position",
          q=>q.in("gameweek",weekIds).eq("is_final",true).order("gameweek").order("player_id"))
      ])
      const report=frozenAccuracyReport({weeks,players,positions,weeklyPositions})
      return Response.json(report)
    }
    if(action==="audit_run"){
      // Always inspect actual replay inputs + probabilities, never a stale
      // dashboard cache; this is read only and safe during active MH.
      const runId=String(body.run_id||current.id)
      const runQ=await sb.from("scout_model_runs").select("*").eq("id",runId).single()
      if(runQ.error)throw runQ.error
      const run=runQ.data
      const gw=Number(run.gameweek)
      const noteBenchmark=String((run.notes||"").split(" • ")[1]||"").trim()
      let benchmark=String(body.benchmark||
        ((noteBenchmark.startsWith("weekly-auto-mh")||noteBenchmark.startsWith("intraday-mh"))?noteBenchmark:"")).trim()
      // Weekly candidate notes contain a lifecycle key + human prose,
      // not the replay benchmark; resolve metadata instead of guessing.
      if(!benchmark){
        const lifecycleKey=String(run.notes||"").split(" • ")[0]
        const metaRef=await sb.from("scout_replay_input_meta")
          .select("benchmark_version").eq("gameweek",gw)
          .ilike("source_note","%"+lifecycleKey+"%")
          .order("created_at",{ascending:false}).limit(1).maybeSingle()
        if(metaRef.error)throw metaRef.error
        benchmark=String(metaRef.data?.benchmark_version||"")
      }
      if(!benchmark)return Response.json({ok:false,error:"AUDIT_BENCHMARK_MISSING"},{status:409})
      const [players,matches,fixtures,shares,projections,matchPreds,goalConfig,meta,teamStats,tactical]=await Promise.all([
        sb.from("scout_replay_player_inputs").select("player_id,club_id,position,rates,availability").eq("gameweek",gw).eq("benchmark_version",benchmark),
        sb.from("scout_replay_match_inputs").select("match_id,home_team_id,away_team_id,home_lambda,away_lambda").eq("gameweek",gw).eq("benchmark_version",benchmark),
        sb.from("scout_match_history").select("match_id,home_team_id,away_team_id").eq("season","2026-27").eq("gameweek",gw),
        sb.from("scout_role_signals").select("player_id,team_goal_share,team_assist_share").eq("run_id",runId),
        sb.from("scout_player_projections").select("player_id,expected_goals").eq("run_id",runId),
        sb.from("scout_match_predictions").select("match_id,home_xg,away_xg,home_cs_probability,away_cs_probability").eq("run_id",runId),
        sb.from("scout_goal_distribution_config").select("alpha_used,distribution,gate_passed").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle(),
        sb.from("scout_replay_input_meta").select("own_goal_fraction").eq("gameweek",gw).eq("benchmark_version",benchmark).maybeSingle(),
        sb.from("scout_team_season_stats").select("team_id,through_gameweek,advanced_matches,matches_played").eq("through_gameweek",gw-1),
        sb.from("scout_team_tactical_profiles").select("team_id,through_gameweek,coverage,event_shot_sample,conceded_channel_sample_actions").eq("season","2026-27")
      ])
      for(const q of [players,matches,fixtures,shares,projections,matchPreds,goalConfig,meta,teamStats,tactical])if(q.error)throw q.error
      const prep=auditMatchAllocation({
        gameweek:gw,fixtures:fixtures.data||[],matchInputs:matches.data||[],
        playerInputs:players.data||[],roleShares:shares.data||[]
      })
      const dist=goalConfig.data
      const alpha=dist?.gate_passed&&String(dist.distribution).toUpperCase()==="NB2"
        ?Number(dist.alpha_used):0
      const realized=auditRealizedModel({
        matchInputs:matches.data||[],matchPredictions:matchPreds.data||[],
        playerInputs:players.data||[],playerProjections:projections.data||[],
        alpha,ownFraction:n(meta.data?.own_goal_fraction,.031),
        simulationCount:Number(run.simulation_count)
      })
      const teamAdvanced=teamStats.data||[]
      const weakZones=(tactical.data||[]).filter((x:any)=>
        Number(x.event_shot_sample||0)<30||String(x.coverage)!=="event_verified")
      const warnings=[
        ...(teamAdvanced.length!==18?["TEAM_SEASON_STATS_INCOMPLETE"]:[]),
        ...(teamAdvanced.some((x:any)=>Number(x.advanced_matches)<Number(x.matches_played))?
          ["TEAM_ADVANCED_XG_LAGS_GOAL_FORM"]:[]),
        ...(weakZones.length?["INFERRED_WEAK_ZONE_NOT_SAFE_FOR_MULTIPLIERS"]:[]),
        ...prep.warnings,...realized.warnings
      ]
      const pass=prep.pass&&realized.pass&&teamAdvanced.length===18
      return Response.json({
        ok:pass,pass,run_id:runId,gameweek:gw,benchmark,
        allocation:prep,distribution:realized,warnings,
        team_advanced_rows:teamAdvanced.length,
        inferred_weak_zones:weakZones.length,
        no_writes:true
      },{status:pass?200:409})
    }
    if(action==="status")return Response.json({ok:true,...status})
    if(action==="close_backtest"){
      if(!status.complete_current)return Response.json({ok:false,error:"current gameweek not fully closed",...status},{status:409})
      // The current live run may be a rolling post-deadline projection.
      // Close historical accuracy against the ORIGINAL frozen backtest run,
      // including its pre-deadline squad recommendations, never the latest.
      const frozenQ=await sb.from("scout_backtest_weeks")
        .select("run_id,snapshot_at,prediction_mode")
        .eq("gameweek",Number(current.gameweek)).single()
      if(frozenQ.error)throw frozenQ.error
      const frozen=frozenQ.data
      const matchQ=await sb.from("scout_match_predictions")
        .select("kickoff_at").eq("run_id",current.id).order("kickoff_at",{ascending:true}).limit(1).single()
      if(matchQ.error)throw matchQ.error
      if(!frozen?.run_id||frozen.prediction_mode!=="live_frozen"||
         !(new Date(frozen.snapshot_at).getTime()<new Date(matchQ.data.kickoff_at).getTime()))
        throw new Error("FROZEN_BACKTEST_RUN_REQUIRED")
      const q=await sb.rpc("scout_close_live_backtest",{p_run_id:frozen.run_id})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data,frozen_run_id:frozen.run_id,live_run_id:current.id,...status})
    }
    if(action==="prepare"){
      const result=await prepare(sb,current,status,body)
      return Response.json({ok:true,...result})
    }
    if(action==="prepare_current"){
      const result=await prepareCurrentRefresh(sb,current,body)
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
