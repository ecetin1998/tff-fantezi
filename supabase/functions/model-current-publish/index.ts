import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUD="tff-fantezi-scout"
const ISS="https://token.actions.githubusercontent.com"
const REPO="ecetin1998/tff-fantezi"
const REPO_ID="1353738004"
const JWKS="https://token.actions.githubusercontent.com/.well-known/jwks"

function jsonPart(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=");return JSON.parse(atob(p))}
function bytePart(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=");return Uint8Array.from(atob(p),c=>c.charCodeAt(0))}
async function authorized(req:Request){
  const h=req.headers.get("authorization")||""
  if(!h.startsWith("Bearer "))return false
  try{
    const parts=h.slice(7).split(".");if(parts.length!==3)return false
    const head=jsonPart(parts[0]),p=jsonPart(parts[1]),now=Math.floor(Date.now()/1000)
    const aud=Array.isArray(p.aud)?p.aud.includes(AUD):p.aud===AUD
    if(head.alg!=="RS256"||!head.kid||p.iss!==ISS||!aud||Number(p.exp||0)<now-30||Number(p.nbf||0)>now+30||
      p.repository_id!==REPO_ID||p.repository!==REPO||p.ref!=="refs/heads/main"||
      !["push","workflow_dispatch","schedule"].includes(String(p.event_name||"")))return false
    const jwks=await fetch(JWKS).then(r=>r.json()),jwk=(jwks.keys||[]).find((k:any)=>k.kid===head.kid)
    if(!jwk)return false
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])
    return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,bytePart(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]))
  }catch{return false}
}
async function latest(sb:any,table:string,column:string){
  const q=await sb.from(table).select(column).not(column,"is",null).order(column,{ascending:false}).limit(1).maybeSingle()
  if(q.error)throw q.error
  return q.data?.[column]||null
}
function chunks<T>(rows:T[],size=200){const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out}
async function insertChunks(sb:any,table:string,rows:any[]){
  for(const part of chunks(rows)){const q=await sb.from(table).insert(part);if(q.error)throw q.error}
}

Deno.serve(async(req:Request)=>{
  let runId:string|null=null
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json()
    const meta=body.meta||{},inputs=body.inputs||{}
    const projections=Array.isArray(body.projections)?body.projections:[]
    const roleSignals=Array.isArray(body.role_signals)?body.role_signals:[]
    const availability=Array.isArray(body.availability)?body.availability:[]
    if(Number(meta.draws)<50000)throw new Error("candidate publish requires >=50000 draws")
    if(Number(meta.gameweek)!==7)throw new Error("candidate publish currently expects GW7")
    if(projections.length!==449||roleSignals.length!==449)throw new Error("449-player candidate contract failed")
    if(!Array.isArray(inputs.players)||inputs.players.length!==449)throw new Error("449-player input snapshot required")
    if(!Array.isArray(inputs.matches)||inputs.matches.length!==9)throw new Error("9-match input snapshot required")

    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const sourceRunId=String(meta.source_run_id||"")
    const source=await sb.from("scout_model_runs").select("*").eq("id",sourceRunId).single()
    if(source.error)throw source.error
    if(!source.data.is_current)throw new Error("source run is no longer current")

    const [playerUpdated,teamUpdated]=await Promise.all([
      latest(sb,"scout_player_season_stats","updated_at"),
      latest(sb,"scout_team_season_stats","source_updated_at")
    ])
    const timestamps=[source.data.source_updated_at,playerUpdated,teamUpdated,...availability.map((x:any)=>x.checked_at)].filter(Boolean).map((x:any)=>new Date(x).getTime()).filter(Number.isFinite)
    const sourceUpdatedAt=new Date(Math.max(...timestamps)).toISOString()

    runId=crypto.randomUUID()
    const runWrite=await sb.from("scout_model_runs").insert({
      id:runId,gameweek:7,
      model_version:String(meta.model_version||"ScoutPlus 3.4 candidate / GW7 • current enrichment • 50K"),
      generated_at:new Date().toISOString(),source_updated_at:sourceUpdatedAt,
      simulation_count:Number(meta.draws),status:"building",is_current:false,
      notes:"Live candidate: GW6 stable-rate base + current detailed roles + effective xA + reviewed actions + reviewed GW7 availability. Promotion gated."
    })
    if(runWrite.error)throw runWrite.error

    const metaWrite=await sb.from("scout_model_input_meta").insert({
      run_id:runId,source_run_id:sourceRunId,source_gameweek:6,
      source_benchmark:"fresh-current-logic+cold-start-v1-2026-09-24",
      enrichment_version:"roles-xa-actions-2026-09-28",
      availability_checked_at:availability.length?availability[0].checked_at:null
    })
    if(metaWrite.error)throw metaWrite.error

    await insertChunks(sb,"scout_model_player_inputs",inputs.players.map((x:any)=>({
      run_id:runId,player_id:x.player_id,club_id:x.club_id,position:x.position,price:x.price,
      availability:x.availability,role_probability:x.role_probability,bench_weight:x.bench_weight,
      durations:x.durations,duration_weights:x.duration_weights,rates:x.rates,
      data_confidence:x.data_confidence,sub_role:x.sub_role,role_side:x.role_side,
      effective_xa_per90:x.effective_xa_per90,source_note:x.source_note
    })))
    await insertChunks(sb,"scout_model_match_inputs",inputs.matches.map((x:any)=>({...x,run_id:runId})))

    const sourceMatches=await sb.from("scout_match_predictions").select("*").eq("run_id",sourceRunId)
    if(sourceMatches.error)throw sourceMatches.error
    await insertChunks(sb,"scout_match_predictions",(sourceMatches.data||[]).map((x:any)=>({...x,run_id:runId})))

    await insertChunks(sb,"scout_player_projections",projections.map((x:any)=>({
      run_id:runId,...x,top25_score:null,top25_rank:null,top25_model_version:null
    })))
    await insertChunks(sb,"scout_role_signals",roleSignals.map((x:any)=>({run_id:runId,...x})))
    if(availability.length)await insertChunks(sb,"scout_availability",availability.map((x:any)=>({run_id:runId,...x})))

    const top25=await sb.rpc("refresh_top25_live_gb",{p_run_id:runId})
    if(top25.error)throw top25.error
    if(Number(top25.data)!==449)throw new Error("Top25 live scorer updated "+top25.data+" rows, expected 449")

    const ready=await sb.from("scout_model_runs").update({status:"ready"}).eq("id",runId).eq("status","building")
    if(ready.error)throw ready.error
    return Response.json({ok:true,run_id:runId,gameweek:7,players:449,matches:9,top25_rows:Number(top25.data)})
  }catch(error:any){
    return Response.json({error:String(error?.message||error),run_id:runId},{status:500})
  }
})
