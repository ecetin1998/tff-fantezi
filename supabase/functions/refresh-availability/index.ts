import {createClient} from "https://esm.sh/@supabase/supabase-js@2"

const AUDIENCE="tff-fantezi-scout"
const ISSUER="https://token.actions.githubusercontent.com"
const REPOSITORY="ecetin1998/tff-fantezi"
const REPOSITORY_ID="1353738004"
const JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks"
const SOURCE_URL="https://sakat-ve-cezali.com/turkiye-super-lig.php"

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

function htmlText(value:string){
  return String(value||"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&ccedil;/gi,"ç").replace(/&Ccedil;/g,"Ç")
    .replace(/&ouml;/gi,"ö").replace(/&Ouml;/g,"Ö")
    .replace(/&uuml;/gi,"ü").replace(/&Uuml;/g,"Ü")
    .replace(/&gbreve;/gi,"ğ").replace(/&Gbreve;/g,"Ğ")
    .replace(/&scedil;/gi,"ş").replace(/&Scedil;/g,"Ş")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/\s+/g," ")
    .trim()
}
function normalize(value:string){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("tr")
    .replace(/ı/g,"i")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\b(?:fk|sk|spor kulubu|kulubu)\b/g," ")
    .replace(/\s+/g," ")
    .trim()
}
function levenshtein(a:string,b:string){
  if(a===b)return 0
  if(!a.length)return b.length
  if(!b.length)return a.length
  const prev=Array.from({length:b.length+1},(_,i)=>i)
  for(let i=1;i<=a.length;i++){
    let left=i,diag=i-1
    for(let j=1;j<=b.length;j++){
      const up=prev[j]
      const next=Math.min(up+1,left+1,diag+(a[i-1]===b[j-1]?0:1))
      prev[j]=next;diag=up;left=next
    }
  }
  return prev[b.length]
}
function nameScore(a:string,b:string){
  const x=normalize(a),y=normalize(b)
  if(!x||!y)return 0
  if(x===y)return 1
  const xt=x.split(" "),yt=y.split(" ")
  const xs=new Set(xt),ys=new Set(yt)
  const overlap=[...xs].filter(t=>ys.has(t)).length
  const tokenScore=overlap/Math.max(1,Math.min(xs.size,ys.size))
  const charScore=1-levenshtein(x,y)/Math.max(x.length,y.length,1)
  const lastBonus=xt.at(-1)===yt.at(-1)?.toString()?0.04:0
  return Math.min(1,Math.max(tokenScore,charScore)+lastBonus)
}
function parseDate(value:string){
  const m=String(value||"").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if(!m)return null
  return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`
}
const MONTHS:any={ocak:1,subat:2,mart:3,nisan:4,mayis:5,haziran:6,temmuz:7,agustos:8,eylul:9,ekim:10,kasim:11,aralik:12}
function expectedDate(value:string){
  const raw=String(value||"").trim()
  const exact=parseDate(raw)
  if(exact)return exact
  const n=normalize(raw)
  const monthName=Object.keys(MONTHS).find(m=>n.includes(m))
  const year=Number(n.match(/20\d{2}/)?.[0]||new Date().getUTCFullYear())
  if(!monthName)return null
  const day=n.includes("son")?25:n.includes("orta")?15:5
  return `${year}-${String(MONTHS[monthName]).padStart(2,"0")}-${String(day).padStart(2,"0")}`
}
function sourceUpdatedAt(html:string){
  const text=htmlText(html)
  const m=text.match(/Son Güncelleme:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2})/i)
  if(!m)return new Date().toISOString()
  return new Date(Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4])-3,Number(m[5]))).toISOString()
}
function probability(kind:string,expected:string|null){
  if(kind==="suspensions")return 0
  if(!expected)return .5
  if(normalize(expected).includes("supheli"))return .5
  const d=expectedDate(expected)
  if(!d)return .5
  const days=(new Date(d+"T12:00:00Z").getTime()-Date.now())/864e5
  return days<=14?.5:0
}

function parseSource(html:string){
  const sections=[...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|<\/main>|<footer\b|$)/gi)]
  const rows:any[]=[]
  for(const sec of sections){
    const team=htmlText(sec[1])
    if(!team)continue
    for(const tr of sec[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
      const rawCells=[...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>htmlText(m[1]))
      const cells=rawCells[0]?.trim()?rawCells:rawCells.slice(1)
      if(cells.length<2||normalize(cells[0])==="oyuncu")continue
      const player=cells[0]?.trim()
      const reason=cells[1]?.trim()
      if(!player||!reason)continue
      const isSuspension=/cezali|cezalı/i.test(reason)
      const suspensionMatch=reason.match(/Cezalı olduğu maç\(lar\):\s*([^|]+)/i)?.[1]?.trim()||null
      rows.push({
        source_team:team,
        source_player:player,
        kind:isSuspension?"suspensions":"injuries",
        reason:reason.replace(/Cezalı olduğu maç\(lar\):[\s\S]*/i,"").trim(),
        injury_date:isSuspension?null:parseDate(cells[2]||""),
        suspension_date:isSuspension?parseDate(cells[2]||""):null,
        expected_return:isSuspension?null:(cells[3]||null),
        source_suspension_fixture:isSuspension?suspensionMatch:null,
      })
    }
  }
  return rows
}

function teamScore(source:string,target:string){
  const a=normalize(source),b=normalize(target)
  if(a===b)return 1
  if(a.includes(b)||b.includes(a))return .95
  return nameScore(a,b)
}
function formatFixture(match:any,teams:Map<number,string>){
  if(!match)return null
  const date=new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(match.match_date))
  return `${date} • ${teams.get(Number(match.home_team_id))||"?"} - ${teams.get(Number(match.away_team_id))||"?"}`
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401})
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const response=await fetch(SOURCE_URL,{headers:{"user-agent":"FanteziScout/1.0 availability refresh"}})
    if(!response.ok)return Response.json({error:"availability source fetch failed",status:response.status},{status:502})
    const html=await response.text()
    const parsed=parseSource(html)
    if(parsed.length<20)return Response.json({error:"availability source parse coverage too low",parsed:parsed.length},{status:409})
    const sourceUpdated=sourceUpdatedAt(html)
    const now=new Date().toISOString()

    const [runQ,playersQ,teamsQ,fixturesQ]=await Promise.all([
      sb.from("scout_model_runs").select("id,gameweek").eq("is_current",true).eq("status","ready").limit(1).single(),
      sb.from("scout_players").select("id,full_name,display_name,short_label,team_id").eq("active",true),
      sb.from("scout_teams").select("id,name"),
      sb.from("fixtures").select("id,home_team_id,away_team_id,match_date").gte("match_date",now).order("match_date",{ascending:true}).limit(80),
    ])
    for(const q of [runQ,playersQ,teamsQ,fixturesQ])if(q.error)throw q.error
    const runId=runQ.data.id
    const teams=new Map<number,string>((teamsQ.data||[]).map((t:any)=>[Number(t.id),String(t.name)]))
    const teamBySource=new Map<string,number>()
    for(const row of parsed){
      const key=normalize(row.source_team)
      if(teamBySource.has(key))continue
      const ranked=(teamsQ.data||[]).map((t:any)=>({id:Number(t.id),score:teamScore(row.source_team,t.name)})).sort((a:any,b:any)=>b.score-a.score)
      if(!ranked[0]||ranked[0].score<.72)continue
      teamBySource.set(key,ranked[0].id)
    }

    const fixturesByTeam=new Map<number,any>()
    for(const m of fixturesQ.data||[]){
      for(const id of [Number(m.home_team_id),Number(m.away_team_id)]){
        if(!fixturesByTeam.has(id))fixturesByTeam.set(id,m)
      }
    }

    const matched:any[]=[]
    const unmatched:any[]=[]
    for(const row of parsed){
      const teamId=teamBySource.get(normalize(row.source_team))
      if(!teamId){unmatched.push({...row,reason_unmatched:"team"});continue}
      const candidates=(playersQ.data||[]).filter((p:any)=>Number(p.team_id)===teamId)
      const ranked=candidates.map((p:any)=>({
        p,score:Math.max(nameScore(row.source_player,p.full_name),nameScore(row.source_player,p.display_name||""),nameScore(row.source_player,p.short_label||""))
      })).sort((a:any,b:any)=>b.score-a.score)
      const best=ranked[0],second=ranked[1]
      if(!best||best.score<.72||(second&&best.score<.9&&best.score-second.score<.04)){
        unmatched.push({...row,reason_unmatched:"player",best:best?{name:best.p.full_name,score:Number(best.score.toFixed(3))}:null})
        continue
      }
      matched.push({...row,player_id:Number(best.p.id),team_id:teamId,match_score:best.score})
    }
    if(unmatched.length>6)return Response.json({error:"too many unmatched availability rows",matched:matched.length,unmatched},{status:409})

    const currentQ=await sb.from("scout_availability").select("*").eq("run_id",runId)
    if(currentQ.error)throw currentQ.error
    const current=new Map<number,any>((currentQ.data||[]).map((r:any)=>[Number(r.player_id),r]))
    const next=new Map<number,any>()

    for(const row of matched){
      const suspensionFixture=row.kind==="suspensions"?(row.source_suspension_fixture||formatFixture(fixturesByTeam.get(row.team_id),teams)):null
      const expected=row.expected_return?.trim()||null
      next.set(row.player_id,{
        run_id:runId,
        player_id:row.player_id,
        availability_type:row.kind,
        availability_probability:probability(row.kind,expected),
        reason:row.reason,
        canonical_reason:row.reason,
        checked_at:now,
        source_url:SOURCE_URL,
        source_reason:row.reason,
        injury_date:row.injury_date,
        suspension_end:row.suspension_date,
        expected_return:expected,
        expected_return_date:expected?expectedDate(expected):null,
        suspension_fixture:suspensionFixture,
        detail_source_label:"availability_primary",
        detail_source_url:SOURCE_URL,
        detail_source_updated_at:sourceUpdated,
      })
    }

    for(const old of current.values()){
      if(next.has(Number(old.player_id)))continue
      next.set(Number(old.player_id),{
        ...old,
        availability_type:"baseline",
        availability_probability:1,
        reason:null,
        canonical_reason:null,
        checked_at:now,
        source_url:SOURCE_URL,
        source_reason:null,
        injury_date:null,
        suspension_end:null,
        expected_return:null,
        expected_return_date:null,
        suspension_fixture:null,
        detail_source_label:"availability_primary",
        detail_source_url:SOURCE_URL,
        detail_source_updated_at:sourceUpdated,
      })
    }

    const comparable=(r:any)=>JSON.stringify([
      r?.availability_type,Number(r?.availability_probability??1),r?.canonical_reason||null,
      r?.injury_date||null,r?.suspension_end||null,r?.expected_return||null,r?.expected_return_date||null,r?.suspension_fixture||null
    ])
    let changed=0
    for(const row of next.values()){
      if(comparable(current.get(Number(row.player_id)))!==comparable(row))changed++
    }
    const rows=[...next.values()]
    const write=await sb.from("scout_availability").upsert(rows,{onConflict:"run_id,player_id"})
    if(write.error)throw write.error

    return Response.json({
      ok:true,run_id:runId,source_updated_at:sourceUpdated,checked_at:now,
      parsed:parsed.length,matched:matched.length,unmatched,changed,
      injuries:rows.filter((r:any)=>r.availability_type==="injuries").length,
      suspensions:rows.filter((r:any)=>r.availability_type==="suspensions").length,
      baselines:rows.filter((r:any)=>r.availability_type==="baseline").length,
      model_refresh_required:changed>0,
    })
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
