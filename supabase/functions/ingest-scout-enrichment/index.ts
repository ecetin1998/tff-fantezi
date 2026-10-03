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
      p.ref!=="refs/heads/main"||!["workflow_dispatch","push"].includes(String(p.event_name||""))
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

    if(body.mode==="weekly_delta"){
      const norm=(v:any)=>String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/ı/g,"i").replace(/ş/g,"s").replace(/ğ/g,"g").replace(/ç/g,"c").replace(/ö/g,"o").replace(/ü/g,"u").replace(/[^a-z0-9]+/g," ").trim()
      const teamNorm=(v:any)=>norm(v).replace(/\\b(fk|sk|caykur)\\b/g,"").replace(/\\s+/g," ").trim()
      const teamsQ=await sb.from("scout_teams").select("id,name")
      if(teamsQ.error)throw teamsQ.error
      const teamById=new Map((teamsQ.data||[]).map((t:any)=>[Number(t.id),String(t.name)]))
      const participantQ=await sb.from("scout_player_weekly_points").select("player_id,minutes").eq("gameweek",throughGameweek).gt("minutes",0); if(participantQ.error)throw participantQ.error; const participantIds=new Set((participantQ.data||[]).map((x:any)=>Number(x.player_id))); const playersQ=await sb.from("scout_players").select("id,full_name,display_name,short_label,team_id").in("id",[...participantIds])
      if(playersQ.error)throw playersQ.error
      const players=(playersQ.data||[]).map((p:any)=>({...p,team_name:teamById.get(Number(p.team_id))||""}))
      const sourceRows=Array.isArray(body.weekly_stats)?body.weekly_stats:[]
      const aliases:Record<string,string>={
        "i jakobs":"ismail jakobs","d sanchez":"davinson sanchez","franculino":"franculino dju","eren elmali":"eren elmali",
        "l ugochukwu":"lesley ugochukwu","r toth":"regö toth","a skov olsen":"andreas skov olsen","e shomurodov":"eldor shomurodov",
        "r luiz":"roberto luiz","p martor":"peter martor","umut meras":"umut meras","ali turap bulbul":"ali turap bulbul",
        "a sowe":"ali sowe","taha sahin":"taha sahin","j ramirez":"jhonatan ramirez","f hadergjonaj":"floran hadergjonaj",
        "h ui jo":"hwang ui jo","e meschack":"elias meschack","ivan cedric":"ivan cedric","a abdullahi":"abdullahi",
        "kerem akturkoglu":"kerem akturkoglu","anil yasar":"anil yasar","levent mercan":"levent mercan","m sissoho":"moussa sissoho",
        "l perez":"lucas perez","m haidara":"massadio haidara","l tomasson":"logi tomasson","ertugrul taskiran":"ertugrul taskiran"
      }
      const mh6SourcePlayerIds:Record<string,number>={
        "d sanchez":516,"c winck":94,"a benedyczak":75,"guven yalcin":81,"r toth":679,"ali yavuz kol":72,
        "m rafferty":78,"kerem demirbay":77,"j jessen":88,"e mendes":97,"ayberk karapo":71,"e shomurodov":404,
        "r luiz":1545,"o diabate":326,"orkun kokcu":281,"d vlahovic":593,"m rashica":257,"ridvan yilmaz":259,
        "a murillo":277,"e poku":1141,"salih ozcan":285,"f miretti":1209,"ilhan fakili":278,"v cerny":279,
        "rhaldney":304,"a matos":313,"r akonnor":811,"ege yildirim":292,"bekir boke":712,"f hadergjonaj":427,
        "h ui jo":417,"a abdullahi":495,"kerem akturkoglu":169,"halil dervisoglu":536,"l perez":572,
        "m haidara":132,"l tomasson":457
      }
      const unmatched:any[]=[]
      const resolved:any[]=[]
      for(const x of sourceRows){
        const rawN=norm(x.player_name),n=aliases[rawN]||rawN,tn=teamNorm(x.team_name)
        const sourceTeamId=Number(x.source_team_id||0)
        const sourceTeamMap:Record<number,number>={21774:14,7285:8}
        const mappedTeamId=sourceTeamMap[sourceTeamId]||0
        const sourceUrl=norm(x.source_url||"")
        let pool=players.filter((p:any)=>{
          const pt=teamNorm(p.team_name)
          return tn ? (pt===tn||pt.includes(tn)||tn.includes(pt)) : (!sourceUrl||sourceUrl.includes(pt))
        })
        if(!pool.length)pool=players
        const exact=pool.filter((p:any)=>[p.full_name,p.display_name,p.short_label].some((v:any)=>norm(v)===n))
        let hit=players.find((p:any)=>Number(p.id)===mh6SourcePlayerIds[rawN]) || (exact.length===1?exact[0]:null)
        if(!hit){
          const bits=n.split(" ").filter(Boolean),last=bits.at(-1)||"",first=(bits[0]||"")[0]||""
          const fuzzy=pool.filter((p:any)=>{
            const names=[p.full_name,p.display_name,p.short_label].map((v:any)=>norm(v)).filter(Boolean)
            return names.some((pn:string)=>{
              const pb=pn.split(" ").filter(Boolean)
              if(pn===n||pn.includes(n)||n.includes(pn))return true
              if(bits.length===1)return pb.includes(n)
              return (pb.at(-1)||"")===last && (!first||(pb[0]||"")[0]===first)
            })
          })
          if(fuzzy.length===1)hit=fuzzy[0]
        }
        if(!hit){unmatched.push({player_name:x.player_name,team_name:x.team_name});continue}
        resolved.push({
          season,gameweek:throughGameweek,player_id:Number(hit.id),
          shots:Math.max(0,Math.round(finite(x.shots)??0)),
          shots_on_target:Math.max(0,Math.round(finite(x.shots_on_target)??0)),
          key_passes:Math.max(0,Math.round(finite(x.key_passes)??0)),
          crosses:Math.max(0,Math.round(finite(x.crosses)??0)),
          successful_crosses:Math.max(0,Math.round(finite(x.successful_crosses)??0)),
          takeons:Math.max(0,Math.round(finite(x.takeons)??0)),
          successful_takeons:Math.max(0,Math.round(finite(x.successful_takeons)??0)),
          source:String(body.source||"sahadan_match_actions"),
          source_updated_at:new Date().toISOString(),
        })
      }
      const dedup=new Map<number,any>()
      for(const r of resolved){
        const old=dedup.get(r.player_id)
        if(!old){dedup.set(r.player_id,r);continue}
        for(const k of ["shots","shots_on_target","key_passes","crosses","successful_crosses","takeons","successful_takeons"])old[k]+=r[k]
      }
      const weekly=[...dedup.values()]
      if(weekly.length){
        const w=await sb.from("scout_player_advanced_weekly").upsert(weekly,{onConflict:"season,gameweek,player_id"})
        if(w.error)throw w.error
      }
      const ids=[...new Set(weekly.map((r:any)=>r.player_id))]
      if(ids.length){
        const bq=await sb.from("scout_player_advanced_baseline").select("*").eq("season",season).in("player_id",ids)
        if(bq.error)throw bq.error
        const wq=await sb.from("scout_player_advanced_weekly").select("*").eq("season",season).lte("gameweek",throughGameweek).in("player_id",ids)
        if(wq.error)throw wq.error
        const byBase=new Map((bq.data||[]).map((r:any)=>[Number(r.player_id),r]))
        const sums=new Map<number,any>()
        for(const r of wq.data||[]){
          const id=Number(r.player_id),a=sums.get(id)||{shots:0,shots_on_target:0,key_passes:0,crosses:0,successful_crosses:0,takeons:0,successful_takeons:0}
          for(const k of Object.keys(a))a[k]+=Number(r[k]||0)
          sums.set(id,a)
        }
        const patches:any[]=[]
        for(const id of ids){
          const b:any=byBase.get(id)
          if(!b)continue
          const a=sums.get(id)||{}
          const existing=await sb.from("scout_player_season_stats").select("through_gameweek").eq("season",season).eq("player_id",id).maybeSingle(); if(existing.error)throw existing.error; const patch:any={season,player_id:id,through_gameweek:Number(existing.data?.through_gameweek||throughGameweek),advanced_through_gameweek:throughGameweek,advanced_updated_at:new Date().toISOString(),advanced_source:String(body.source||"sahadan_match_actions")}
          for(const k of ["shots","shots_on_target","key_passes","crosses","successful_crosses","takeons","successful_takeons"])patch[k]=Number(b[k]||0)+Number(a[k]||0)
          patches.push(patch)
        }
        if(patches.length){
          const uq=await sb.from("scout_player_season_stats").upsert(patches,{onConflict:"season,player_id"})
          if(uq.error)throw uq.error
        }
      }
      if(unmatched.length===0 && Number(body.source_match_count||0)>=9){
        const cq=await sb.from("scout_player_season_stats").update({
          advanced_through_gameweek:throughGameweek,
          advanced_updated_at:new Date().toISOString(),
          advanced_source:String(body.source||"sahadan_match_actions"),
        }).eq("season",season).eq("through_gameweek",throughGameweek)
        if(cq.error)throw cq.error
      }
      const refresh=await sb.rpc("scout_refresh_enrichment_profiles",{p_season:season,p_through_gameweek:throughGameweek})
      if(refresh.error)throw refresh.error
      return Response.json({ok:unmatched.length===0,mode:"weekly_delta",matched:weekly.length,unmatched,source_match_count:Number(body.source_match_count||0),qa:refresh.data},{status:unmatched.length?409:200})
    }

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
