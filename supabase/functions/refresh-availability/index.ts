import {createClient} from "https://esm.sh/@supabase/supabase-js@2"
import {assessAvailabilityCoverage,crossTeamIdentitySupported} from "./coverage.mjs"
import {SECONDARY_URL,parseWmrAvailability,matchSupplementaryPlayer,verifyWmrSuspension} from "./secondarySources.mjs"

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
  const date=new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(match.kickoff_at||match.match_date))
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
    // Independent secondary feed. A failed fetch cannot negate a verified primary report.
    // A secondary-only injury is queued for review rather than automatically labeling a player injured.
    let secondaryRows:any[]=[]
    let secondaryUsable=false
    try {
      const secondaryResponse=await fetch(SECONDARY_URL,{
        headers:{"user-agent":"FanteziLigRehberi/1.0 availability multi-source verification"},
        signal:AbortSignal.timeout(12000)
      })
      if(secondaryResponse.ok) {
        const body=await secondaryResponse.text()
        const claims=parseWmrAvailability(body)
        if(claims.length>=15 && claims.length<=300) {
          secondaryRows=claims
          secondaryUsable=true
        } else {
          console.warn("availability_secondary_coverage_low",claims.length)
        }
      } else console.warn("availability_secondary_http",secondaryResponse.status)
    }catch(error) {
      console.warn("availability_secondary_fetch_error",String(error))
    }

    const runQ=await sb.from("scout_model_runs").select("id,gameweek").eq("is_current",true).eq("status","ready").limit(1).single()
    if(runQ.error)throw runQ.error
    const runId=runQ.data.id
    const targetWeek=Number(runQ.data.gameweek)
    const previousWeek=targetWeek-1
    const [playersQ,teamsQ,predictedFixturesQ,fixturesQ,inactivePlayersQ]=await Promise.all([
      sb.from("scout_players").select("id,full_name,display_name,short_label,team_id").eq("active",true),
      sb.from("scout_teams").select("id,name"),
      sb.from("scout_match_predictions").select("match_id,home_team_id,away_team_id,kickoff_at").eq("run_id",runId).order("kickoff_at",{ascending:true}),
      sb.from("fixtures").select("id,home_team_id,away_team_id,match_date").eq("gameweek",Number(runQ.data.gameweek)).order("match_date",{ascending:true}),
      sb.from("scout_players").select("id,full_name,display_name,short_label,team_id").eq("active",false),
    ])
    for(const q of [playersQ,teamsQ,predictedFixturesQ,fixturesQ,inactivePlayersQ])if(q.error)throw q.error
    // Source-specific cross-checks: season yellow count, last finished week's
    // card event, and (only as fallback) the independent Highlightly box score.
    const [cardsQ,priorWeekQ,highlightlyQ]=await Promise.all([
      sb.from("scout_player_season_stats")
        .select("player_id,yellow_cards,through_gameweek").eq("season","2026-27")
        .eq("through_gameweek",previousWeek),
      sb.from("scout_match_player_evidence")
        .select("player_id,gameweek,yellow_cards,red_cards,source_url").eq("season","2026-27")
        .eq("gameweek",previousWeek),
      sb.from("scout_highlightly_player_matches")
        .select("player_id,gameweek,yellow_cards,red_cards")
        .eq("season","2026-27").eq("gameweek",previousWeek).not("player_id","is",null)
    ])
    // If any cross-check feed is unavailable, do not claim verified card suspensions
    // based on a single injury website. The primary source still works normally.
    const secondaryCardsReady=!cardsQ.error && (!priorWeekQ.error || !highlightlyQ.error)
    if(!secondaryCardsReady)console.warn("availability_secondary_card_crosscheck_unavailable")
    const seasonCards=new Map<number,number>((cardsQ.data||[])
      .map((x:any)=>[Number(x.player_id),Number(x.yellow_cards)]))
    const officialCardEvidence=new Map<number,{yellow:number,red:number}>()
    for(const row of priorWeekQ.data||[]){
      const playerId=Number(row.player_id),v=officialCardEvidence.get(playerId)||{yellow:0,red:0}
      v.yellow+=Number(row.yellow_cards||0)
      v.red+=Number(row.red_cards||0)
      officialCardEvidence.set(playerId,v)
    }
    const highlightlyCardEvidence=new Map<number,{yellow:number,red:number}>()
    for(const row of highlightlyQ.data||[]){
      const playerId=Number(row.player_id),v=highlightlyCardEvidence.get(playerId)||{yellow:0,red:0}
      v.yellow+=Number(row.yellow_cards||0)
      v.red+=Number(row.red_cards||0)
      highlightlyCardEvidence.set(playerId,v)
    }
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
    // Use the current run fixture set so suspension QA follows rescheduled live fixtures.
    const canonicalFixtures=(predictedFixturesQ.data||[]).length?predictedFixturesQ.data:fixturesQ.data||[]
    for(const m of canonicalFixtures){
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
        // The injury feed lists non-Fantasy and inactive squad members too.
        // Compare against inactive players separately, not as candidates for
        // a live projection (which would silently re-add obsolete players).
        const scorePlayer=(p:any)=>Math.max(
          nameScore(row.source_player,p.full_name),
          nameScore(row.source_player,p.display_name||""),
          nameScore(row.source_player,p.short_label||""))
        const inactiveBest=(inactivePlayersQ.data||[])
          .filter((p:any)=>Number(p.team_id)===teamId)
          .map((p:any)=>({p,score:scorePlayer(p)}))
          .sort((a:any,b:any)=>b.score-a.score)[0]
        const elsewhereBest=(playersQ.data||[])
          .filter((p:any)=>Number(p.team_id)!==teamId)
          .map((p:any)=>({p,score:crossTeamIdentitySupported(row.source_player,p.full_name)
            ?nameScore(row.source_player,p.full_name):0}))
          .sort((a:any,b:any)=>b.score-a.score)[0]
        unmatched.push({...row,team_id:teamId,reason_unmatched:"player",
          best:best?{name:best.p.full_name,score:Number(best.score.toFixed(3))}:null,
          inactive_best:inactiveBest?{name:inactiveBest.p.full_name,score:Number(inactiveBest.score.toFixed(3))}:null,
          active_elsewhere_best:elsewhereBest?{name:elsewhereBest.p.full_name,score:Number(elsewhereBest.score.toFixed(3))}:null})
        continue
      }
      matched.push({...row,player_id:Number(best.p.id),team_id:teamId,match_score:best.score})
    }
    const coverage=assessAvailabilityCoverage({
      parsedCount:parsed.length,matchedCount:matched.length,unmatched
    })
    if(!coverage.accepted)return Response.json({
      error:"availability source matching needs roster review",
      parsed:parsed.length,matched:matched.length,
      critical:coverage.critical,ignored:coverage.ignored,
      unmatched,
    },{status:409})
    // If an otherwise acceptable source still has a possibly misnamed active
    // player, preserve previously flagged injuries in the affected team.
    const uncertainTeams=new Set<number>(coverage.critical
      .map((row:any)=>Number(row.team_id)).filter((id:number)=>Number.isSafeInteger(id)))
    const activePlayerTeam=new Map<number,number>((playersQ.data||[])
      .map((p:any)=>[Number(p.id),Number(p.team_id)]))
    if(coverage.ignored.length)console.warn(JSON.stringify({
      event:"availability_out_of_roster_ignored",
      inactive:coverage.skippedInactive,unlisted:coverage.skippedUnlisted,
      names:coverage.ignored.map((row:any)=>row.source_player)
    }))

    const currentQ=await sb.from("scout_availability").select("*").eq("run_id",runId)
    if(currentQ.error)throw currentQ.error
    const current=new Map<number,any>((currentQ.data||[]).map((r:any)=>[Number(r.player_id),r]))
    const next=new Map<number,any>()

    for(const row of matched){
      const suspensionFixture=row.kind==="suspensions"?(formatFixture(fixturesByTeam.get(row.team_id),teams)||row.source_suspension_fixture):null
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
        suspension_end:row.suspension_date,
      })
    }

    let secondaryApplied=0,secondaryPending=0,secondaryMatched=0,secondaryUnmatched=0
    const secondaryObservations:any[]=[]
    for(const row of secondaryRows){
      const identity=matchSupplementaryPlayer(row,playersQ.data||[],teamsQ.data||[],nameScore)
      if(identity.playerId===undefined){
        secondaryUnmatched++
        continue // Do not write an unconfirmed person to the current fantasy roster.
      }
      secondaryMatched++
      const playerId=Number(identity.playerId),teamId=Number(identity.teamId)
      const primary=next.get(playerId)
      const fixture=fixturesByTeam.get(teamId)
      const kickoff=fixture?.kickoff_at||fixture?.match_date||null
      const official=officialCardEvidence.get(playerId)
      const hl=highlightlyCardEvidence.get(playerId)
      const evidence=official||hl||{yellow:0,red:0}
      const proof=row.kind==="suspensions" && secondaryCardsReady
        ?verifyWmrSuspension({
            row,kickoffAt:kickoff,primaryKind:primary?.availability_type,
            cumulativeYellow:seasonCards.get(playerId),
            lastWeekYellow:evidence.yellow,lastWeekRed:evidence.red,
            targetGameweek:targetWeek,evidenceGameweek:previousWeek
          })
        :{verified:false,reason:row.kind==="injuries"?"injury_needs_second_source":"crosscheck_unavailable"}
      const verified=(row.kind==="injuries" && primary?.availability_type==="injuries") ||
        (row.kind==="suspensions" && proof.verified)
      const decision=verified?(row.kind==="injuries"?"primary_and_secondary":proof.reason):proof.reason
      secondaryObservations.push({
        season:"2026-27",gameweek:targetWeek,player_id:playerId,team_id:teamId,
        source:"wmrtips",source_player:row.player,source_team:row.team,
        availability_type:row.kind,reason:row.reason||null,source_url:SECONDARY_URL,
        source_start:row.start,source_return:row.returnDate,
        verified,decision_reason:decision,
        evidence:{cumulativeYellow:seasonCards.get(playerId)??null,
          lastWeekYellow:evidence.yellow,lastWeekRed:evidence.red,
          cardsFrom:official?"scout_match_player_evidence":hl?"highlightly":"unknown",
          primaryType:primary?.availability_type||"baseline",
          fixtureKickoff:kickoff||null},
        observed_at:now
      })
      if(row.kind==="suspensions" && verified && fixture){
        // A genuine newly-reached card threshold beats the absence of a
        // player on the primary exceptions list, without changing official points.
        next.set(playerId,{
          ...primary,run_id:runId,player_id:playerId,
          availability_type:"suspensions",availability_probability:0,
          reason:row.reason||"Sarı kart cezası",
          canonical_reason:row.reason||"Sarı kart cezası",
          checked_at:now,source_url:SECONDARY_URL,
          source_reason:row.reason||"Sarı kart cezası",
          injury_date:null,suspension_end:row.returnDate,
          expected_return:null,expected_return_date:null,
          suspension_fixture:formatFixture(fixture,teams),
          detail_source_label:"availability_multi_source_verified",
          detail_source_url:SECONDARY_URL,detail_source_updated_at:now
        })
        secondaryApplied++
      } else if(!verified) secondaryPending++
    }
    if(secondaryObservations.length) {
      const writeEvidence=await sb.from("scout_availability_source_observations")
        .upsert(secondaryObservations,{onConflict:"season,gameweek,player_id,source"})
      if(writeEvidence.error)throw writeEvidence.error
    }

    for(const old of current.values()){
      if(next.has(Number(old.player_id)))continue
      const oldId=Number(old.player_id)
      const oldFixture=fixturesByTeam.get(activePlayerTeam.get(oldId)!)
      const oldDate=String(oldFixture?.kickoff_at||oldFixture?.match_date||"").slice(0,10)
      if(!secondaryUsable &&
          old.detail_source_label==="availability_multi_source_verified" &&
          old.availability_type==="suspensions" && old.suspension_end &&
          oldDate && old.suspension_end>oldDate){
        // Temporary source outage must not silently clear a previously
        // independently confirmed ban before the actual banned fixture.
        next.set(oldId,{...old})
        continue
      }
      if(uncertainTeams.has(activePlayerTeam.get(oldId)!) &&
          old.availability_type!=="baseline"){
        // Unknown source alias: leave pre-existing injury intact rather than
        // assert recovery merely because an exact name did not match.
        next.set(oldId,{...old})
        continue
      }
      next.set(oldId,{
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
        suspension_end:null,
      })
    }

    // The availability feed is an *exceptions* list, not a complete roster.
    // A newly-added active player absent from the feed and from the
    // previous run still needs an explicit neutral baseline row, otherwise
    // weekly prepare fails AVAILABILITY_COVERAGE_INCOMPLETE. Never replace
    // sourced injuries/suspensions: those are already in `next`.
    for(const player of playersQ.data||[]){
      const id=Number(player.id)
      if(!Number.isInteger(id)||next.has(id))continue
      next.set(id,{
        run_id:runId,
        player_id:id,
        availability_type:"baseline",
        availability_probability:1,
        reason:null,
        canonical_reason:null,
        checked_at:now,
        source_url:null,
        source_reason:null,
        injury_date:null,
        suspension_end:null,
        expected_return:null,
        expected_return_date:null,
        suspension_fixture:null,
        detail_source_label:"active_roster_no_reported_exception",
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

    // Detect staleness from prior manually verified suspensions, even when
    // the availability feed itself produces the same row on this refresh.
    const projectionsQ=await sb.from("scout_player_projections")
      .select("player_id,availability_probability").eq("run_id",runId)
    if(projectionsQ.error)throw projectionsQ.error
    const projectedAvailability=new Map<number,number>((projectionsQ.data||[])
      .map((p:any)=>[Number(p.player_id),Number(p.availability_probability)]))
    const outOfSync=rows.filter((a:any)=>
      projectedAvailability.has(Number(a.player_id)) &&
      Math.abs(Number(a.availability_probability)-Number(projectedAvailability.get(Number(a.player_id))))>0.001
    ).length
    const rebuildRequired=changed>0||outOfSync>0

    return Response.json({
      ok:true,run_id:runId,source_updated_at:sourceUpdated,checked_at:now,
      parsed:parsed.length,matched:matched.length,
      unmatched:coverage.critical,source_ignored_inactive:coverage.skippedInactive,
      source_unlisted:coverage.skippedUnlisted,source_coverage:coverage.coverage,changed:changed+outOfSync,
      source_changed:changed,projection_availability_mismatches:outOfSync,
      injuries:rows.filter((r:any)=>r.availability_type==="injuries").length,
      suspensions:rows.filter((r:any)=>r.availability_type==="suspensions").length,
      baselines:rows.filter((r:any)=>r.availability_type==="baseline").length,
      model_refresh_required:rebuildRequired,
      secondary_source:secondaryUsable?"wmrtips":"unavailable",
      secondary_claims:secondaryRows.length,
      secondary_matched:secondaryMatched,secondary_unmatched:secondaryUnmatched,
      secondary_verified_and_applied:secondaryApplied,
      secondary_needs_review:secondaryPending,
    })
  }catch(error:any){
    return Response.json({error:String(error?.message||error)},{status:500})
  }
})
