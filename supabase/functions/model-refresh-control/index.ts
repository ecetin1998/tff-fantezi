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
function ageHours(value:string|null|undefined){
  if(!value)return Infinity
  const ts=new Date(value).getTime()
  return Number.isFinite(ts)?Math.max(0,(Date.now()-ts)/36e5):Infinity
}
function engineSignature(value:string){
  return String(value||"").replace(/\b(?:GW|MH)\s*\d+\b/gi,"GW#").replace(/\s+/g," ").trim()
}
async function latestTimestamp(sb:any,table:string,column:string,filters:Record<string,any>={}){
  let q=sb.from(table).select(column).not(column,"is",null)
  for(const [key,value] of Object.entries(filters))q=q.eq(key,value)
  const res=await q.order(column,{ascending:false}).limit(1).maybeSingle()
  if(res.error)throw res.error
  return res.data?.[column]||null
}
async function upsertGate(sb:any,runId:string,patch:any){
  const existing=await sb.from("scout_run_release_gates").select("*").eq("run_id",runId).maybeSingle()
  if(existing.error)throw existing.error
  const details={...(existing.data?.details||{}),...(patch.details||{})}
  const row={
    run_id:runId,
    qa_pass:Boolean(existing.data?.qa_pass),
    data_integrity_pass:Boolean(existing.data?.data_integrity_pass),
    backtest_pass:Boolean(existing.data?.backtest_pass),
    availability_freshness:Boolean(existing.data?.availability_freshness),
    checked_by:"github-actions/weekly-lifecycle",
    checked_at:new Date().toISOString(),
    ...patch,
    details,
  }
  const w=await sb.from("scout_run_release_gates").upsert(row,{onConflict:"run_id"})
  if(w.error)throw w.error
}
async function currentStatus(sb:any){
  const cur=await sb.from("scout_model_runs")
    .select("id,gameweek,model_version,generated_at,source_updated_at,status,is_current")
    .eq("is_current",true).eq("status","ready").order("generated_at",{ascending:false}).limit(1).maybeSingle()
  if(cur.error)throw cur.error
  if(!cur.data)return {ok:false,waiting:true,reason:"no_current_run"}
  const gw=Number(cur.data.gameweek)
  const matches=await sb.from("scout_match_history")
    .select("match_id,kickoff_at,match_status,fantasy_closure")
    .eq("season","2026-27").eq("gameweek",gw)
  if(matches.error)throw matches.error
  const rows=matches.data||[]
  const closed=rows.filter((m:any)=>{
    const st=String(m.match_status||"").trim().toLocaleLowerCase("tr")
    const fc=String(m.fantasy_closure||"").trim().toLocaleLowerCase("tr")
    return ["bitti","finished","ft"].includes(st)&&["kapandi","kapandı","closed"].includes(fc)
  }).length
  const lastKickoff=rows.map((m:any)=>new Date(m.kickoff_at).getTime()).filter(Number.isFinite).sort((a:number,b:number)=>b-a)[0]||0
  const poll=rows.length===9&&(closed===9||Date.now()>=lastKickoff+105*60*1000)
  const next=await sb.from("scout_match_history").select("match_id",{count:"exact",head:true}).eq("season","2026-27").eq("gameweek",gw+1)
  if(next.error)throw next.error
  const finals=await sb.from("scout_player_weekly_points").select("match_id").eq("gameweek",gw).eq("is_final",true)
  if(finals.error)throw finals.error
  const finalMatches=new Set((finals.data||[]).map((x:any)=>String(x.match_id))).size
  const fullyClosed=rows.length===9&&closed===9&&finalMatches===9
  return {
    ok:true,current_run:cur.data,current_gameweek:gw,target_gameweek:gw+1,
    matches:rows.length,closed_matches:closed,final_point_matches:finalMatches,
    last_kickoff:lastKickoff?new Date(lastKickoff).toISOString():null,
    poll,fully_closed:fullyClosed,next_fixture_count:Number(next.count||0)
  }
}

Deno.serve(async(req:Request)=>{
  let body:any={}
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    body=await req.json().catch(()=>({}))
    const stage=String(body.stage||"")
    const runId=body.run_id?String(body.run_id):null
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    if(stage==="health"){
      return Response.json({ok:true,upstream_configured:Boolean(String(Deno.env.get("SCOUT_INGEST_URL")||"").trim())})
    }

    if(stage==="status")return Response.json(await currentStatus(sb))

    if(stage==="ingest"){
      const before=await currentStatus(sb)
      if(!before.ok)return Response.json(before)
      const endpoint=String(Deno.env.get("SCOUT_INGEST_URL")||"").trim()
      if(endpoint){
        const token=String(Deno.env.get("SCOUT_INGEST_TOKEN")||"").trim()
        const response=await fetch(endpoint,{
          method:"POST",
          headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},
          body:JSON.stringify({current_gameweek:before.current_gameweek,target_gameweek:before.target_gameweek,reason:"weekly_lifecycle"})
        })
        if(!response.ok)return Response.json({ok:false,waiting:true,reason:"upstream_ingest_failed",status:response.status})
      }
      const gw=before.current_gameweek
      const sources={
        availability:await latestTimestamp(sb,"scout_availability","checked_at"),
        player_stats:await latestTimestamp(sb,"scout_player_season_stats","updated_at",{through_gameweek:gw}),
        team_stats:await latestTimestamp(sb,"scout_team_season_stats","source_updated_at",{through_gameweek:gw}),
        match_history:await latestTimestamp(sb,"scout_match_history","source_updated_at",{gameweek:gw}),
        weekly_points:await latestTimestamp(sb,"scout_player_weekly_points","source_updated_at",{gameweek:gw}),
      }
      const stale=Object.entries(sources).filter(([,value])=>ageHours(value as string)>24)
        .map(([name,value])=>({name,value,age_hours:ageHours(value as string)}))
      const after=await currentStatus(sb)
      if(stale.length)return Response.json({ok:false,waiting:true,reason:"source_data_stale",upstream_configured:Boolean(endpoint),sources,stale,status:after})
      return Response.json({ok:true,upstream_configured:Boolean(endpoint),sources,status:after})
    }

    if(stage==="close"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const q=await sb.rpc("scout_finalize_live_backtest",{p_run_id:runId})
      if(q.error)throw q.error
      return Response.json(q.data)
    }

    if(stage==="prepare"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const q=await sb.rpc("scout_prepare_next_week",{p_current_run_id:runId})
      if(q.error)throw q.error
      return Response.json(q.data)
    }

    if(stage==="top25"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const gw=Number(body.gameweek||0),benchmark=String(body.benchmark||"")
      if(!gw||!benchmark)return Response.json({error:"gameweek and benchmark required"},{status:400})
      const q=await sb.rpc("refresh_top25_gb_v1",{p_run_id:runId,p_gameweek:gw,p_benchmark:benchmark})
      if(q.error)throw q.error
      return Response.json({ok:true,updated:q.data})
    }

    if(stage==="ready"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const gw=Number(body.gameweek||0),benchmark=String(body.benchmark||"")
      const q=await sb.rpc("scout_mark_candidate_ready",{p_run_id:runId,p_gameweek:gw,p_benchmark:benchmark})
      if(q.error)throw q.error
      return Response.json(q.data)
    }

    if(stage==="qa"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const [q,bq]=await Promise.all([
        sb.rpc("scout_run_qa",{p_run_id:runId}),
        sb.rpc("scout_model_bugfix_qa",{p_run_id:runId})
      ])
      if(q.error)throw q.error
      if(bq.error)throw bq.error
      const pass=Boolean(q.data?.pass)&&Boolean(bq.data?.pass)
      await upsertGate(sb,runId,{qa_pass:pass,details:{model_qa:q.data,bugfix_qa:bq.data}})
      return Response.json({ok:pass,pass,model_qa:q.data,bugfix_qa:bq.data},{status:pass?200:409})
    }

    if(stage==="integrity"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const q=await sb.rpc("scout_data_integrity_qa",{p_run_id:runId})
      if(q.error)throw q.error
      const pass=Boolean(q.data?.pass)
      const rows=await sb.from("scout_availability").select("checked_at").eq("run_id",runId).order("checked_at",{ascending:true}).limit(1).maybeSingle()
      if(rows.error)throw rows.error
      const meta=await sb.from("scout_model_runs").select("generated_at").eq("id",runId).single()
      if(meta.error)throw meta.error
      const availabilityFresh=Boolean(rows.data?.checked_at)&&new Date(rows.data.checked_at)>=new Date(new Date(meta.data.generated_at).getTime()-24*36e5)
      await upsertGate(sb,runId,{data_integrity_pass:pass,availability_freshness:availabilityFresh,details:{data_integrity:q.data}})
      return Response.json({ok:pass&&availabilityFresh,pass,availability_freshness:availabilityFresh,result:q.data},{status:pass&&availabilityFresh?200:409})
    }

    if(stage==="model_gate"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const cycle=await sb.from("scout_weekly_cycles").select("*").eq("candidate_run_id",runId).maybeSingle()
      if(cycle.error)throw cycle.error
      if(!cycle.data)return Response.json({error:"weekly cycle missing"},{status:409})
      const [parent,candidate,parentGate]=await Promise.all([
        sb.from("scout_model_runs").select("id,model_version").eq("id",cycle.data.current_run_id).single(),
        sb.from("scout_model_runs").select("id,model_version").eq("id",runId).single(),
        sb.from("scout_run_release_gates").select("*").eq("run_id",cycle.data.current_run_id).single()
      ])
      for(const q of [parent,candidate,parentGate])if(q.error)throw q.error
      const sameEngine=engineSignature(parent.data.model_version)===engineSignature(candidate.data.model_version)
      const pass=sameEngine&&Boolean(parentGate.data.backtest_pass)
      await upsertGate(sb,runId,{
        backtest_pass:pass,
        details:{model_validation:{pass,same_engine:sameEngine,inherited_from:parent.data.id,reason:"unchanged engine; prior leakage-safe replay gate inherited; closed live week recorded separately"}}
      })
      return Response.json({ok:pass,pass,same_engine:sameEngine,inherited_from:parent.data.id},{status:pass?200:409})
    }

    if(stage==="block"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const upd=await sb.from("scout_weekly_cycles").update({
        status:"blocked",last_stage:String(body.failed_stage||"unknown"),
        last_error:String(body.reason||"blocked").slice(0,1000),updated_at:new Date().toISOString()
      }).eq("candidate_run_id",runId)
      if(upd.error)throw upd.error
      return Response.json({ok:true,blocked:true})
    }

    if(stage==="promote"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const q=await sb.rpc("scout_promote_run",{p_run_id:runId})
      if(q.error)throw q.error
      return Response.json({ok:true,result:q.data})
    }

    if(stage==="complete"){
      if(!runId)return Response.json({error:"run_id required"},{status:400})
      const upd=await sb.from("scout_weekly_cycles").update({
        status:"completed",last_stage:"promoted",last_error:null,updated_at:new Date().toISOString(),completed_at:new Date().toISOString()
      }).eq("candidate_run_id",runId)
      if(upd.error)throw upd.error
      const cur=await sb.from("scout_model_runs").select("id,gameweek,is_current,status").eq("id",runId).single()
      if(cur.error)throw cur.error
      return Response.json({ok:true,current:cur.data})
    }

    return Response.json({error:"unknown stage"},{status:400})
  }catch(error:any){
    return Response.json({error:String(error?.message||error),stage:String(body?.stage||"")},{status:500})
  }
})
