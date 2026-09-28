import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUD="tff-fantezi-scout"
const ISS="https://token.actions.githubusercontent.com"
const REPO="ecetin1998/tff-fantezi"
const REPO_ID="1353738004"
const JWKS="https://token.actions.githubusercontent.com/.well-known/jwks"
const BASE_BENCHMARK="fresh-current-logic+cold-start-v1-2026-09-24"
const BASE_GW=6

function jsonPart(v:string){
  const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=")
  return JSON.parse(atob(p))
}
function bytePart(v:string){
  const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=")
  return Uint8Array.from(atob(p),c=>c.charCodeAt(0))
}
async function authorized(req:Request){
  const h=req.headers.get("authorization")||""
  if(!h.startsWith("Bearer "))return false
  try{
    const parts=h.slice(7).split(".")
    if(parts.length!==3)return false
    const head=jsonPart(parts[0]),p=jsonPart(parts[1]),now=Math.floor(Date.now()/1000)
    const aud=Array.isArray(p.aud)?p.aud.includes(AUD):p.aud===AUD
    if(head.alg!=="RS256"||!head.kid||p.iss!==ISS||!aud||
      Number(p.exp||0)<now-30||Number(p.nbf||0)>now+30||
      p.repository_id!==REPO_ID||p.repository!==REPO||
      p.ref!=="refs/heads/main"||!["push","workflow_dispatch","schedule"].includes(String(p.event_name||"")))return false
    const jwks=await fetch(JWKS).then(r=>r.json())
    const jwk=(jwks.keys||[]).find((k:any)=>k.kid===head.kid)
    if(!jwk)return false
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"])
    return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,bytePart(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]))
  }catch{return false}
}
function clamp(v:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,v))}
function finite(v:any){const n=Number(v);return Number.isFinite(n)?n:null}
function singleShotCap(role:string,pos:string){
  const r=String(role||"").toUpperCase()
  if(r==="CB")return .22
  if(r==="FB")return .32
  if(r==="WB")return .36
  if(pos==="DEF")return .27
  if(pos==="MID")return .33
  return .42
}
function blended(base:number,observed:number|null,minutes:number){
  if(observed===null||!(minutes>0))return base
  const w=clamp(minutes/450,0,.75)
  return (1-w)*base+w*observed
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json().catch(()=>({}))
    const snapshot=body.availability_snapshot||{}
    if(Number(snapshot.target_gameweek)!==7||!Array.isArray(snapshot.players)){
      return Response.json({error:"reviewed GW7 availability snapshot required"},{status:400})
    }
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    const current=await sb.from("scout_model_runs")
      .select("id,gameweek,model_version,source_updated_at,generated_at")
      .eq("is_current",true).single()
    if(current.error)throw current.error
    if(Number(current.data.gameweek)!==7)throw new Error("live candidate currently expects GW7")

    const [playersQ,featuresQ,rolesQ,baseQ,metaQ,matchesQ,teamsQ]=await Promise.all([
      sb.from("scout_players").select("id,team_id,position,price,primary_role,role_side,role_source,role_confidence,active").eq("active",true),
      sb.from("v_scout_player_model_features").select("player_id,team_id,position,primary_role,role_side,role_confidence,minutes,goals,assists,xg_total,xa_total,observed_xa_per90,xa_model_per90,effective_xa_per90,shots,shots_on_target"),
      sb.from("scout_role_signals").select("*").eq("run_id",current.data.id),
      sb.from("scout_replay_player_inputs").select("*").eq("gameweek",BASE_GW).eq("benchmark_version",BASE_BENCHMARK),
      sb.from("scout_replay_input_meta").select("*").eq("gameweek",BASE_GW).eq("benchmark_version",BASE_BENCHMARK).single(),
      sb.from("scout_match_predictions").select("*").eq("run_id",current.data.id).order("kickoff_at"),
      sb.from("scout_teams").select("id,name")
    ])
    for(const q of [playersQ,featuresQ,rolesQ,baseQ,metaQ,matchesQ,teamsQ])if(q.error)throw q.error

    const active=playersQ.data||[]
    const feature=new Map((featuresQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
    const roleSignal=new Map((rolesQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
    const base=new Map((baseQ.data||[]).map((x:any)=>[Number(x.player_id),x]))
    const issue=new Map((snapshot.players||[]).map((x:any)=>[Number(x.player_id),x]))
    if(active.length!==449)throw new Error("active-player contract failed: "+active.length)
    const missingBase=active.filter((p:any)=>!base.has(Number(p.id)))
    if(missingBase.length)throw new Error("missing GW6 base input for "+missingBase.length+" active players")

    const normalized=active.map((p:any)=>{
      const id=Number(p.id),b:any=base.get(id),f:any=feature.get(id)||{},sig:any=roleSignal.get(id)||{}
      const rates=(Array.isArray(b.rates)?b.rates:[]).map((x:any)=>Number(x)||0)
      while(rates.length<12)rates.push(0)
      const mins=Number(f.minutes||0)
      const role=String(p.primary_role||f.primary_role||"")
      let xgTotal=finite(f.xg_total)
      const shots=finite(f.shots)
      if(shots===1&&xgTotal!==null)xgTotal=Math.min(xgTotal,singleShotCap(role,String(p.position)))
      const xg90=xgTotal!==null&&mins>0?xgTotal*90/mins:null
      const g90=finite(f.goals)!==null&&mins>0?Number(f.goals)*90/mins:null
      const a90=finite(f.assists)!==null&&mins>0?Number(f.assists)*90/mins:null
      const shots90=shots!==null&&mins>0?shots*90/mins:null
      const sot=finite(f.shots_on_target)
      const sot90=sot!==null&&mins>0?sot*90/mins:null
      rates[0]=blended(Number(rates[0]||0),xg90,mins)
      rates[1]=blended(Number(rates[1]||0),g90,mins)
      rates[2]=blended(Number(rates[2]||0),a90,mins)
      const exa=finite(f.effective_xa_per90)
      if(exa!==null)rates[3]=exa
      rates[10]=blended(Number(rates[10]||0),shots90,mins)
      rates[11]=blended(Number(rates[11]||0),sot90,mins)
      const av:any=issue.get(id)
      const availability=av?clamp(Number(av.model_probability),0,1):1
      return {
        id,club:Number(p.team_id),pos:String(p.position),price:Number(p.price||b.price||0),
        avail:availability,
        role:clamp(Number(sig.predicted_xi_probability??b.role_probability??0),.0001,.9999),
        benchw:Math.max(1e-9,Number(b.bench_weight)||1e-9),
        durations:b.durations||[75],duration_weights:b.duration_weights||[1],rates,
        confidence:String(b.data_confidence||"medium"),valid_games:1,
        sub_role:role,role_side:p.role_side||f.role_side||null,
        effective_xa_per90:exa,
        source_note:"GW6 stable base + current role/xA/action overlay; no future replay mutation",
        availability_source:av?"reviewed_sakat_ve_cezali_2026-09-28":"reviewed_absence_not_listed",
        role_signal:sig
      }
    })

    const matches=(matchesQ.data||[]).map((m:any)=>({
      match_id:Number(m.match_id),home_id:Number(m.home_team_id),away_id:Number(m.away_team_id),
      home_lambda:Number(m.home_xg),away_lambda:Number(m.away_xg),kickoff_at:m.kickoff_at
    }))
    const teamNames=Object.fromEntries((teamsQ.data||[]).map((t:any)=>[String(t.id),t.name]))
    const availabilityRows=(snapshot.players||[]).filter((x:any)=>active.some((p:any)=>Number(p.id)===Number(x.player_id))).map((x:any)=>({
      player_id:Number(x.player_id),availability_type:String(x.availability_type),
      availability_probability:Number(x.model_probability),reason:String(x.reason||""),
      checked_at:new Date().toISOString(),source_url:String(snapshot.source_url||""),
      expected_return:String(x.expected_return||""),source_reason:String(x.policy_key||""),
      detail_source_label:"sakat-ve-cezali.com",detail_source_url:String(snapshot.source_url||""),
      detail_source_updated_at:String(snapshot.source_updated_at||snapshot.reviewed_at||new Date().toISOString()),
      canonical_reason:String(x.reason||"")
    }))

    const meta=metaQ.data
    return Response.json({
      meta:{
        source_run_id:current.data.id,gameweek:7,
        source_benchmark:BASE_BENCHMARK,source_gameweek:BASE_GW,
        model_version:"ScoutPlus 3.4 candidate / GW7 • current roles+xA+actions • 50K",
        temperature:Number(meta.temperature||1.7),
        assist_fraction:Number(meta.assist_fraction||.6692307692307692),
        own_goal_fraction:Number(meta.own_goal_fraction||.038461538461538464),
        enrichment_version:"roles-xa-actions-2026-09-28"
      },
      players:normalized,matches,team_names:teamNames,
      team_checks:Object.entries(meta.team_formations||meta.formations||{}).map(([club,formation])=>({club:Number(club),formation})),
      temperature:Number(meta.temperature||1.7),
      assist_fraction:Number(meta.assist_fraction||.6692307692307692),
      own_fraction:Number(meta.own_goal_fraction||.038461538461538464),
      availability_rows:availabilityRows,
      playerMatches:[]
    })
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
