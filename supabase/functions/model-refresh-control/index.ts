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
  const header=decodeJson(parts[0]),payload=decodeJson(parts[1])
  const now=Math.floor(Date.now()/1000)
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
function ageHours(value:string|null|undefined){
  if(!value)return Infinity
  const ts=new Date(value).getTime()
  return Number.isFinite(ts)?Math.max(0,(Date.now()-ts)/36e5):Infinity
}
function engineSignature(value:string){
  return String(value||"").replace(/\b(?:GW|MH)\s*\d+\b/gi,"GW#").replace(/\s+/g," ").trim()
}
function goalConfigFingerprint(row:any){
  if(!row?.version)return ""
  return [
    row.version,
    row.alpha_used!=null?`alpha=${row.alpha_used}`:null,
    row.gate_benchmark||null
  ].filter(Boolean).join("|")
}
async function latestTimestamp(sb:any,table:string,column:string){
  const q=await sb.from(table).select(column).not(column,"is",null).order(column,{ascending:false}).limit(1).maybeSingle()
  if(q.error)throw q.error
  return q.data?.[column]||null
}
async function upsertGate(sb:any,runId:string,patch:any){
  const existing=await sb.from("scout_run_release_gates").select("*").eq("run_id",runId).maybeSingle()
  if(existing.error)throw existing.error
  const row={
    run_id:runId,
    qa_pass:Boolean(existing.data?.qa_pass),
    data_integrity_pass:Boolean(existing.data?.data_integrity_pass),
    backtest_pass:Boolean(existing.data?.backtest_pass),
    availability_freshness:Boolean(existing.data?.availability_freshness),
    checked_by:"github-actions/model-refresh",
    details:existing.data?.details||{},
    checked_at:new Date().toISOString(),
    ...patch,
    details:{...(existing.data?.details||{}),...(patch.details||{})},
  }
  const w=await sb.from("scout_run_release_gates").upsert(row,{onConflict:"run_id"})
  if(w.error)throw w.error
}
Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json().catch(()=>({}))
    const stage=String(body.stage||"")
    const runId=body.run_id?String(body.run_id):null
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    if(stage==="ingest"){
      const endpoint=String(Deno.env.get("SCOUT_INGEST_URL")||"").trim()
      const strict=body.strict!==false
      let upstreamStatus:number|null=null
      let upstreamError:string|null=null
      if(endpoint){
        const token=String(Deno.env.get("SCOUT_INGEST_TOKEN")||"").trim()
        try{
          const response=await fetch(endpoint,{method:"POST",headers:token?{authorization:"Bearer "+token}:{}})
          upstreamStatus=response.status
          if(!response.ok)upstreamError="upstream ingest failed"
        }catch(error:any){
          upstreamError=String(error?.message||error)
        }
        if(upstreamError&&strict)return Response.json({error:upstreamError,status:upstreamStatus,upstream_configured:true},{status:502})
      }
      const sources={
        availability:await latestTimestamp(sb,"scout_availability","checked_at"),
        player_stats:await latestTimestamp(sb,"scout_player_season_stats","updated_at"),
        team_stats:await latestTimestamp(sb,"scout_team_season_stats","source_updated_at"),
        match_history:await latestTimestamp(sb,"scout_match_history","source_updated_at"),
        weekly_points:await latestTimestamp(sb,"scout_player_weekly_points","source_updated_at"),
      }
      const stale=Object.entries(sources).filter(([,value])=>ageHours(value as string)>24).map(([name,value])=>({name,value,age_hours:ageHours(value as string)}))
      const ok=!upstreamError&&!stale.length
      if(!ok&&strict)return Response.json({ok:false,error:upstreamError||"source data is stale",sources,stale,upstream_configured:Boolean(endpoint),upstream_status:upstreamStatus},{status:409})
      return Response.json({ok,sources,stale,upstream_configured:Boolean(endpoint),upstream_called:Boolean(endpoint),upstream_status:upstreamStatus,upstream_error:upstreamError})
    }

    if(stage==="candidate"){
      const current=await sb.from("scout_model_runs").select("id,generated_at,source_updated_at").eq("is_current",true).maybeSingle()
      if(current.error)throw current.error
      const q=await sb.from("scout_model_runs")
        .select("id,gameweek,model_version,generated_at,source_updated_at,status,is_current")
        .eq("status","ready").eq("is_current",false)
        .order("generated_at",{ascending:false}).limit(1).maybeSingle()
      if(q.error)throw q.error
      if(!q.data)return Response.json({error:"no ready candidate run"},{status:409})
      if(current.data?.generated_at&&new Date(q.data.generated_at)<=new Date(current.data.generated_at)){
        return Response.json({error:"candidate is not newer than current run",candidate:q.data,current:current.data},{status:409})
      }
      return Response.json({ok:true,run_id:q.data.id,gameweek:q.data.gameweek,candidate:q.data})
    }

    if(!runId)return Response.json({error:"run_id required"},{status:400})

    if(stage==="qa"){
      const q=await sb.rpc("scout_run_qa",{p_run_id:runId})
      if(q.error)throw q.error
      const pass=Boolean(q.data?.pass)
      await upsertGate(sb,runId,{qa_pass:pass,details:{model_qa:q.data}})
      return Response.json({ok:pass,pass,result:q.data},{status:pass?200:409})
    }

    if(stage==="integrity"){
      const q=await sb.rpc("scout_data_integrity_qa",{p_run_id:runId})
      if(q.error)throw q.error
      const pass=Boolean(q.data?.pass)
      const av=await sb.from("scout_availability").select("checked_at").eq("run_id",runId).order("checked_at",{ascending:false}).limit(1).maybeSingle()
      if(av.error)throw av.error
      const availabilityFresh=ageHours(av.data?.checked_at)<=24
      await upsertGate(sb,runId,{data_integrity_pass:pass,availability_freshness:availabilityFresh,details:{data_integrity:q.data}})
      return Response.json({ok:pass&&availabilityFresh,pass,availability_freshness:availabilityFresh,result:q.data},{status:pass&&availabilityFresh?200:409})
    }

    if(stage==="bugfix"){
      const q=await sb.rpc("scout_model_bugfix_qa",{p_run_id:runId})
      if(q.error)throw q.error
      const pass=Boolean(q.data?.pass)
      await upsertGate(sb,runId,{details:{bugfix_qa:q.data}})
      return Response.json({ok:pass,pass,result:q.data},{status:pass?200:409})
    }

    if(stage==="replay"){
      if(body.pass!==true)return Response.json({error:"replay must explicitly pass"},{status:409})
      await upsertGate(sb,runId,{backtest_pass:true,details:{replay:body.details||{pass:true}}})
      return Response.json({ok:true,pass:true})
    }

    if(stage==="model_gate"){
      const cycle=await sb.from("scout_weekly_lifecycle")
        .select("source_run_id,candidate_run_id,target_gameweek")
        .eq("candidate_run_id",runId).maybeSingle()
      if(cycle.error)throw cycle.error
      const parentRunId=cycle.data?.source_run_id||String(body.parent_run_id||"").trim()||null
      if(!parentRunId)return Response.json({error:"model validation parent missing"},{status:409})
      const [parent,candidate,parentGate,goalDist]=await Promise.all([
        sb.from("scout_model_runs").select("id,model_version,config_version").eq("id",parentRunId).single(),
        sb.from("scout_model_runs").select("id,model_version,config_version").eq("id",runId).single(),
        sb.from("scout_run_release_gates").select("backtest_pass").eq("run_id",parentRunId).single(),
        sb.from("scout_goal_distribution_config")
          .select("version,distribution,alpha_used,active,gate_passed,gate_benchmark")
          .eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      ])
      for(const q of [parent,candidate,parentGate,goalDist])if(q.error)throw q.error
      const sameEngine=engineSignature(parent.data.model_version)===engineSignature(candidate.data.model_version)
      const sameConfig=String(parent.data.config_version||"")===String(candidate.data.config_version||"")
      const activeGoalConfig=goalConfigFingerprint(goalDist.data)
      const gatedGoalDistChange=Boolean(
        !sameConfig&&goalDist.data?.active===true&&goalDist.data?.gate_passed===true&&
        String(goalDist.data?.distribution||"").toUpperCase()==="NB2"&&Number(goalDist.data?.alpha_used||0)>0&&
        String(candidate.data.config_version||"")===activeGoalConfig
      )
      const pass=sameEngine&&Boolean(parentGate.data.backtest_pass)&&(sameConfig||gatedGoalDistChange)
      await upsertGate(sb,runId,{
        backtest_pass:pass,
        details:{model_validation:{
          pass,same_engine:sameEngine,same_config:sameConfig,gated_goal_distribution_change:gatedGoalDistChange,
          goal_distribution_gate:goalDist.data?.gate_benchmark||null,inherited_from:parent.data.id,
          reason:!sameEngine
            ?"engine changed; full leakage-safe validation is required"
            :sameConfig
              ?"engine and config unchanged; inherit prior leakage-safe replay gate"
              :gatedGoalDistChange
                ?"goal distribution config changed through its recorded 50K component gate"
                :"config changed without an approved component gate"
        }}
      })
      return Response.json({
        ok:pass,pass,same_engine:sameEngine,same_config:sameConfig,
        gated_goal_distribution_change:gatedGoalDistChange,inherited_from:parent.data.id
      },{status:pass?200:409})
    }

    if(stage==="promote"){
      const q=await sb.rpc("scout_promote_run",{p_run_id:runId})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data})
    }

    return Response.json({error:"unknown stage"},{status:400})
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
