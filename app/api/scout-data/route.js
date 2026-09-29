import {unstable_cache} from 'next/cache'
import {timingSafeEqual} from 'node:crypto'
import {reportServerError} from '@/lib/observability'
import {responseHeadersFor,shouldUsePublicPayloadCache} from '@/lib/scoutApiPolicy.mjs'
import {applyScoutFilters,parseScoutQuery,SCOUT_QUERY_KEYS} from '@/lib/scoutApiFilters.mjs'
import runtimeFixture from '@/test/fixtures/scout-runtime.json'
import {buildScoutSummary,SCOUT_FEED_SCHEMA_VERSION,SCOUT_FEED_SECTIONS,scoutFeedMatchRow} from '@/lib/scoutFeed'
import {
  getAvailability,getBacktestOverview,getBacktestSummary,getMatches,getPlayersWithProjection,
  getRecommendation,getRoleSignals,getWeeklyPoints
} from '@/lib/data'

export const dynamic='force-dynamic'
const responseHeaders={
  'Cache-Control':'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
  'CDN-Cache-Control':'public, s-maxage=60, stale-while-revalidate=60',
  'X-Robots-Tag':'noindex, nofollow, noarchive'
}

function reply(payload,status=200,options={}){
  return Response.json(payload,{status,headers:responseHeadersFor(responseHeaders,{status,...options})})
}
function safeRun(run){
  if(!run)return null
  return {
    id:run.id,gameweek:run.gameweek,generated_at:run.generated_at,
    source_updated_at:run.source_updated_at,status:run.status,is_current:run.is_current
  }
}
function playerRow(p){
  return {
    id:p.id,name:p.full_name||p.display_name||p.short_label,full_name:p.full_name,short_label:p.short_label||null,team:p.team,
    team_id:p.team_id,position:p.position,primary_role:p.primary_role||null,role_side:p.role_side||null,price:Number(p.price||0),
    xa_per90:p.attack_profile?.xa_per90??null,xa_model_per90:p.attack_profile?.xa_model_per90??null,
    total_points:Number(p.total_points||0),
    projection:p.projection?{
      opponent_name:p.projection.opponent_name,venue:p.projection.venue,
      xi_probability:p.projection.xi_probability,x_minutes:p.projection.x_minutes,
      xfp:p.projection.xfp,p25:p.projection.p25,p75:p.projection.p75,p90:p.projection.p90,
      six_plus_probability:p.projection.six_plus_probability,expected_goals:p.projection.expected_goals,
      expected_assists:p.projection.expected_assists,value_score:p.projection.value_score,
      availability_probability:p.projection.availability_probability
    }:null,
    availability:p.availability?{
      availability_type:p.availability.availability_type,
      availability_probability:p.availability.availability_probability,
      reason:p.availability.canonical_reason||null,
      expected_return_date:p.availability.expected_return_date||null,
      suspension_fixture:p.availability.suspension_fixture||null,
      checked_at:p.availability.checked_at||null
    }:null
  }
}
function squad(data){
  return {
    recommendation:data?.recommendation?{
      variant:data.recommendation.variant,budget:data.recommendation.budget,
      xi_xfp:data.recommendation.xi_xfp,formation:data.recommendation.formation
    }:null,
    members:(data?.members||[]).map(m=>({
      player_id:m.player_id,squad_slot:m.squad_slot,is_captain:m.is_captain,bench_order:m.bench_order,
      player:m.player?{id:m.player.id,full_name:m.player.full_name,display_name:m.player.display_name,short_label:m.player.short_label,position:m.player.position,price:m.player.price}:null,
      team:m.team,p90:m.p90
    }))
  }
}
function safeKeyEqual(expected,supplied){
  if(expected.length<24)return false
  const a=Buffer.from(expected),b=Buffer.from(supplied)
  return a.length===b.length&&timingSafeEqual(a,b)
}
function fullAuthorized(request){
  const expected=String(process.env.SCOUT_DATA_API_KEY||'')
  const supplied=String(request.headers.get('x-api-key')||'')
  return safeKeyEqual(expected,supplied)
}

async function buildPayload(section,full){
  const meta={name:'Fantezi Scout data feed',schema_version:SCOUT_FEED_SCHEMA_VERSION,access:full?'keyed-full':'public-read-only',sections:SCOUT_FEED_SECTIONS}
  if(process.env.SCOUT_OFFLINE_BUILD==='1'&&process.env.SCOUT_RUNTIME_FIXTURE==='1'){
    const base=structuredClone(runtimeFixture[section]||runtimeFixture.all)
    return {meta,section,...base,...(full&&section==='performance'?{full:structuredClone(runtimeFixture.performance_full)}:{})}
  }
  if(section==='players'){
    const d=await getPlayersWithProjection()
    return {meta,section,current_run:safeRun(d.run),players:(d.players||[]).map(playerRow)}
  }
  if(section==='matches'){
    const d=await getMatches()
    return {meta,section,current_run:safeRun(d.run),matches:(d.matches||[]).map(scoutFeedMatchRow)}
  }
  if(section==='squads'){
    const [a,b]=await Promise.all([getRecommendation('recommended'),getRecommendation('alternative')])
    return {meta,section,current_run:safeRun(a.run||b.run),recommended:squad(a),alternative:squad(b)}
  }
  if(section==='availability'){
    const d=await getAvailability()
    return {meta,section,current_run:safeRun(d.run),rows:(d.rows||[]).map(a=>({
      player_id:a.player_id,team_id:a.player?.team_id||null,position:a.player?.position||null,availability_type:a.availability_type,availability_probability:a.availability_probability,
      reason:a.canonical_reason||null,checked_at:a.checked_at,injury_date:a.injury_date,
      expected_return_date:a.expected_return_date,suspension_fixture:a.suspension_fixture,
      player:a.player?{id:a.player.id,full_name:a.player.full_name,display_name:a.player.display_name,short_label:a.player.short_label,position:a.player.position,primary_role:a.player.primary_role||null,role_side:a.player.role_side||null,price:a.player.price}:null,
      team:a.team
    }))}
  }
  if(section==='roles'){
    const d=await getRoleSignals()
    return {meta,section,current_run:safeRun(d.run),rows:(d.rows||[]).map(r=>({
      player_id:r.player_id,team_id:r.player?.team_id||null,position:r.player?.position||null,signal:r.signal,predicted_xi_probability:r.predicted_xi_probability,x_minutes:r.x_minutes,
      last2_xi_probability:r.last2_xi_probability,previous2_xi_probability:r.previous2_xi_probability,
      last2_minutes:r.last2_minutes,previous2_minutes:r.previous2_minutes,
      team_goal_share:r.team_goal_share,team_assist_share:r.team_assist_share,
      player:r.player?{id:r.player.id,full_name:r.player.full_name,display_name:r.player.display_name,short_label:r.player.short_label,position:r.player.position,primary_role:r.player.primary_role||null,role_side:r.player.role_side||null,price:r.player.price}:null,
      team:r.team
    }))}
  }
  if(section==='weekly'){
    const d=await getWeeklyPoints()
    return {meta,section,through_gameweek:d.throughGameweek,final_through_gameweek:d.finalThroughGameweek,
      players:(d.players||[]).map(p=>({id:p.id,name:p.full_name||p.display_name||p.short_label,short_label:p.short_label||null,team:p.team,team_id:p.team_id,position:p.position,price:p.price,total_points:p.stats?.actual_points||0,weekly:p.weekly}))}
  }
  if(section==='summary'){
    const summary=await buildScoutSummary()
    return {meta,section,...summary}
  }
  if(section==='performance'){
    const d=full?await getBacktestOverview():await getBacktestSummary()
    const summary={
      current_run:safeRun(d.currentRun),
      qa_pass:Boolean(d.currentRunQa?.pass),
      replay_weeks:(d.replayWeeks||[]).map(w=>({
        gameweek:w.gameweek,status:w.status,player_sample:w.player_sample,average_point_error:w.average_point_error,
        ranking_alignment:w.ranking_alignment,top25_hit_rate:w.top25_hit_rate,average_minute_error:w.average_minute_error,
        band_hit_rate:w.band_hit_rate,expected_band_hit_rate:w.expected_band_hit_rate
      })),
      learning:(d.learning||[]).map(x=>({id:x.id,after_gameweek:x.after_gameweek,component:x.component,status:x.status,summary_tr:x.summary_tr||x.signal}))
    }
    if(!full)return {meta,section,...summary}
    return {meta,section,...summary,full:d}
  }
  const [p,m,a,b,av]=await Promise.all([
    getPlayersWithProjection(),getMatches(),getRecommendation('recommended'),getRecommendation('alternative'),getAvailability()
  ])
  return {
    meta,section:'all',current_run:safeRun(p.run||m.run),
    players:(p.players||[]).map(playerRow),
    matches:(m.matches||[]).map(scoutFeedMatchRow),
    squads:{recommended:squad(a),alternative:squad(b)},
    availability_issues:(av.rows||[]).filter(x=>Number(x.availability_probability??1)<.99).map(x=>({
      player_id:x.player_id,name:x.player?.full_name||x.player?.display_name||x.player?.short_label||null,short_label:x.player?.short_label||null,team:x.team,
      availability_type:x.availability_type,availability_probability:x.availability_probability,
      reason:x.canonical_reason||null,expected_return_date:x.expected_return_date||null,suspension_fixture:x.suspension_fixture||null
    }))
  }
}

const buildCached=unstable_cache(
  async(section,team,position,limit,fieldsKey)=>applyScoutFilters(await buildPayload(section,false),{
    team:team||null,position:position||null,limit:limit||null,fields:fieldsKey?fieldsKey.split(','):[]
  }),
  ['scout-data-v3-public'],
  {revalidate:60}
)

export async function GET(request){
  try{
    const url=new URL(request.url)
    const requested=String(url.searchParams.get('section')||'all').toLowerCase()
    const allowed=new Set(SCOUT_FEED_SECTIONS)
    const parsed=parseScoutQuery(url)
    if(parsed.error)return reply({schema_version:SCOUT_FEED_SCHEMA_VERSION,error:parsed.error},400)
    if(parsed.unknown.length){
      const canonical=new URL(url.origin+url.pathname)
      for(const key of SCOUT_QUERY_KEYS){
        const value=url.searchParams.get(key)
        if(value!==null&&(key!=='section'||value!=='all'))canonical.searchParams.set(key,value)
      }
      return Response.redirect(canonical,308)
    }
    if(!allowed.has(requested))return reply({schema_version:SCOUT_FEED_SCHEMA_VERSION,error:'Bilinmeyen bölüm.'},400)
    const full=requested==='performance'&&fullAuthorized(request)
    const payload=shouldUsePublicPayloadCache(full)
      ?await buildCached(requested,parsed.team,parsed.position,parsed.limit,parsed.fieldsKey)
      :applyScoutFilters(await buildPayload(requested,true),parsed)
    const versioned=payload?.schema_version?payload:{schema_version:SCOUT_FEED_SCHEMA_VERSION,...payload}
    return reply({...versioned,served_at:new Date().toISOString()},200,{privateResponse:full,varyApiKey:requested==='performance'})
  }catch(error){
    reportServerError('api:scout-data',error)
    return Response.json(
      {schema_version:'2.0',error:'Scout verisi şu anda hazırlanamadı.'},
      {status:500,headers:{
        'Cache-Control':'private, no-store',
        'CDN-Cache-Control':'no-store',
        'X-Robots-Tag':'noindex, nofollow, noarchive'
      }}
    )
  }
}
