import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUD="tff-fantezi-scout"
const ISS="https://token.actions.githubusercontent.com"
const REPO="ecetin1998/tff-fantezi"
const REPO_ID="1353738004"
const JWKS="https://token.actions.githubusercontent.com/.well-known/jwks"

function part(v:string){
  const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=")
  return JSON.parse(atob(p))
}
function bytes(v:string){
  const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=")
  return Uint8Array.from(atob(p),c=>c.charCodeAt(0))
}
async function authorized(req:Request){
  const h=req.headers.get("authorization")||""
  if(!h.startsWith("Bearer "))return false
  try{
    const token=h.slice(7),parts=token.split(".")
    if(parts.length!==3)return false
    const head=part(parts[0]),p=part(parts[1]),now=Math.floor(Date.now()/1000)
    const aud=Array.isArray(p.aud)?p.aud.includes(AUD):p.aud===AUD
    if(
      head.alg!=="RS256"||!head.kid||p.iss!==ISS||!aud||
      Number(p.exp||0)<now-30||Number(p.nbf||0)>now+30||
      p.repository_id!==REPO_ID||p.repository!==REPO||
      p.ref!=="refs/heads/main"||p.event_name!=="workflow_dispatch"
    )return false
    const jwks=await fetch(JWKS).then(r=>r.json())
    const jwk=(jwks.keys||[]).find((k:any)=>k.kid===head.kid)
    if(!jwk)return false
    const key=await crypto.subtle.importKey(
      "jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]
    )
    return crypto.subtle.verify(
      {name:"RSASSA-PKCS1-v1_5"},key,bytes(parts[2]),
      new TextEncoder().encode(parts[0]+"."+parts[1])
    )
  }catch{return false}
}

const ROLES=new Set(["GK","CB","FB","WB","DM","CM","AM","WM","W","SS","ST","DEF_UNKNOWN","MID_UNKNOWN","FWD_UNKNOWN"])
const SIDES=new Set(["L","C","R","BOTH","NA"])
const ATTACK_SIDES=new Set(["LEFT","CENTER","RIGHT","UNKNOWN"])
const SHOT_ZONES=new Set(["SIX_YARD","BOX","OUTSIDE_BOX","UNKNOWN"])
const SITUATIONS=new Set(["OPEN_PLAY","COUNTER","CORNER","FREE_KICK","SET_PIECE","PENALTY","THROW_IN","UNKNOWN"])
const EVENT_TYPES=new Set(["shot","goal","own_goal"])

function finite(v:any){
  const n=Number(v)
  return Number.isFinite(n)?n:null
}
function cleanRole(x:any){
  const role=String(x.primary_role||"")
  const side=String(x.role_side||"NA")
  if(!ROLES.has(role))throw new Error("invalid primary_role for player "+x.player_id)
  if(!SIDES.has(side))throw new Error("invalid role_side for player "+x.player_id)
  return {
    player_id:Number(x.player_id),
    primary_role:role,
    role_side:side,
    role_source:String(x.role_source||"reviewed_import"),
    role_confidence:Math.max(0,Math.min(1,finite(x.role_confidence)??.8)),
  }
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const body=await req.json().catch(()=>({}))
    const season=String(body.season||"2026-27")
    const throughGameweek=Number(body.through_gameweek)
    if(!Number.isInteger(throughGameweek)||throughGameweek<0||throughGameweek>34){
      return Response.json({error:"through_gameweek must be 0..34"},{status:400})
    }

    const roles=Array.isArray(body.roles)?body.roles:[]
    const playerStats=Array.isArray(body.player_stats)?body.player_stats:[]
    const events=Array.isArray(body.events)?body.events:[]
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    let roleWrites=0
    for(const raw of roles){
      const row=cleanRole(raw)
      if(!Number.isFinite(row.player_id))throw new Error("invalid player_id in roles")
      const q=await sb.from("scout_players").update({
        primary_role:row.primary_role,
        role_side:row.role_side,
        role_source:row.role_source,
        role_confidence:row.role_confidence,
        updated_at:new Date().toISOString(),
      }).eq("id",row.player_id)
      if(q.error)throw q.error
      roleWrites++
    }

    if(playerStats.length){
      const rows=playerStats.map((x:any)=>{
        const minutes=finite(x.minutes)
        const xaTotal=finite(x.xa_total)
        const xa90=finite(x.xa_per90) ?? (
          xaTotal!==null&&minutes!==null&&minutes>0 ? xaTotal*90/minutes : null
        )
        return {
          season,
          player_id:Number(x.player_id),
          through_gameweek:throughGameweek,
          ...(minutes!==null?{minutes}:{}),
          ...(finite(x.xg_total)!==null?{xg_total:finite(x.xg_total)}:{}),
          ...(xaTotal!==null?{xa_total:xaTotal}:{}),
          ...(xa90!==null?{
            xa_per90:xa90,
            xa_model_per90:xa90,
            xa_source:String(x.xa_source||"current_observed"),
            xa_confidence:Math.max(0,Math.min(1,finite(x.xa_confidence)??1)),
          }:{}),
          ...(finite(x.shots)!==null?{shots:Math.round(Number(x.shots))}:{}),
          ...(finite(x.shots_on_target)!==null?{shots_on_target:Math.round(Number(x.shots_on_target))}:{}),
          ...(finite(x.key_passes)!==null?{key_passes:Math.round(Number(x.key_passes))}:{}),
          ...(finite(x.big_chances_created)!==null?{big_chances_created:Math.round(Number(x.big_chances_created))}:{}),
          ...(finite(x.touches_in_box)!==null?{touches_in_box:Math.round(Number(x.touches_in_box))}:{}),
          ...(finite(x.attack_contribution_share)!==null?{attack_contribution_share:finite(x.attack_contribution_share)}:{}),
          advanced_updated_at:new Date().toISOString(),
        }
      })
      if(rows.some((x:any)=>!Number.isFinite(x.player_id)))throw new Error("invalid player_id in player_stats")
      const q=await sb.from("scout_player_season_stats").upsert(rows,{onConflict:"season,player_id"})
      if(q.error)throw q.error
    }

    if(events.length){
      const rows=events.map((x:any)=>{
        const eventType=String(x.event_type||"")
        const attackSide=x.attack_side?String(x.attack_side):"UNKNOWN"
        const shotZone=x.shot_zone?String(x.shot_zone):"UNKNOWN"
        const situation=x.situation?String(x.situation):"UNKNOWN"
        if(!EVENT_TYPES.has(eventType))throw new Error("invalid event_type "+eventType)
        if(!ATTACK_SIDES.has(attackSide))throw new Error("invalid attack_side "+attackSide)
        if(!SHOT_ZONES.has(shotZone))throw new Error("invalid shot_zone "+shotZone)
        if(!SITUATIONS.has(situation))throw new Error("invalid situation "+situation)
        return {
          season,
          match_id:Number(x.match_id),
          event_id:String(x.event_id),
          gameweek:Number(x.gameweek),
          team_id:Number(x.team_id),
          opponent_team_id:Number(x.opponent_team_id),
          player_id:x.player_id===null||x.player_id===undefined?null:Number(x.player_id),
          assist_player_id:x.assist_player_id===null||x.assist_player_id===undefined?null:Number(x.assist_player_id),
          event_type:eventType,
          minute:finite(x.minute),
          xg:finite(x.xg),
          xa:finite(x.xa),
          attack_side:attackSide,
          shot_zone:shotZone,
          situation,
          body_part:x.body_part?String(x.body_part):null,
          source_kind:String(x.source_kind||"reviewed_import"),
          source_updated_at:x.source_updated_at||new Date().toISOString(),
        }
      })
      const q=await sb.from("scout_match_attack_events").upsert(rows,{onConflict:"season,match_id,event_id"})
      if(q.error)throw q.error
    }

    const refresh=await sb.rpc("scout_refresh_enrichment_profiles",{
      p_season:season,p_through_gameweek:throughGameweek
    })
    if(refresh.error)throw refresh.error

    return Response.json({
      ok:true,season,through_gameweek:throughGameweek,
      roles:roleWrites,player_stats:playerStats.length,events:events.length,
      qa:refresh.data
    })
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
