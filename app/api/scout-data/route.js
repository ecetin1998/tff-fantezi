import {unstable_cache} from 'next/cache'
import {reportServerError} from '@/lib/observability'
import {
  getAvailability,getBacktestOverview,getMatches,getPlayersWithProjection,
  getRecommendation,getRoleSignals,getWeeklyPoints
} from '@/lib/data'

export const dynamic='force-dynamic'
export const revalidate=300
const SCHEMA_VERSION='2.0'
const responseHeaders={
  'Cache-Control':'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
  'CDN-Cache-Control':'public, s-maxage=300, stale-while-revalidate=600',
  'Vercel-CDN-Cache-Control':'public, s-maxage=300, stale-while-revalidate=600',
  'X-Robots-Tag':'noindex, nofollow, noarchive'
}

function reply(payload,status=200){return Response.json(payload,{status,headers:responseHeaders})}
function safeRun(run){
  if(!run)return null
  return {
    id:run.id,gameweek:run.gameweek,generated_at:run.generated_at,
    source_updated_at:run.source_updated_at,status:run.status,is_current:run.is_current
  }
}
function playerRow(p){
  return {
    id:p.id,name:p.display_name||p.full_name,full_name:p.full_name,team:p.team,
    team_id:p.team_id,position:p.position,price:Number(p.price||0),
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
      reason:p.availability.reason||p.availability.source_reason||null,
      expected_return:p.availability.expected_return||null,
      suspension_fixture:p.availability.suspension_fixture||null,
      checked_at:p.availability.checked_at||null
    }:null
  }
}
function matchRow(m){
  return {
    match_id:m.match_id,kickoff_at:m.kickoff_at,home_team_id:m.home_team_id,away_team_id:m.away_team_id,
    home_team:m.home_team,away_team:m.away_team,home_xg:m.home_xg,away_xg:m.away_xg,
    home_win_probability:m.home_win_probability,draw_probability:m.draw_probability,away_win_probability:m.away_win_probability,
    home_cs_probability:m.home_cs_probability,away_cs_probability:m.away_cs_probability
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
      player:m.player?{id:m.player.id,full_name:m.player.full_name,display_name:m.player.display_name,position:m.player.position,price:m.player.price}:null,
      team:m.team,p90:m.p90
    }))
  }
}
function fullAuthorized(request){
  const expected=String(process.env.SCOUT_DATA_API_KEY||'')
  const supplied=String(request.headers.get('x-api-key')||'')
  return expected.length>=24&&supplied===expected
}

const buildCached=unstable_cache(async(section,full)=>{
  const meta={name:'Fantezi Scout data feed',schema_version:SCHEMA_VERSION,access:full?'keyed-full':'public-read-only'}
  if(section==='players'){
    const d=await getPlayersWithProjection()
    return {meta,section,current_run:safeRun(d.run),players:(d.players||[]).map(playerRow)}
  }
  if(section==='matches'){
    const d=await getMatches()
    return {meta,section,current_run:safeRun(d.run),matches:(d.matches||[]).map(matchRow)}
  }
  if(section==='squads'){
    const [a,b]=await Promise.all([getRecommendation('recommended'),getRecommendation('alternative')])
    return {meta,section,current_run:safeRun(a.run||b.run),recommended:squad(a),alternative:squad(b)}
  }
  if(section==='availability'){
    const d=await getAvailability()
    return {meta,section,current_run:safeRun(d.run),rows:(d.rows||[]).map(a=>({
      player_id:a.player_id,availability_type:a.availability_type,availability_probability:a.availability_probability,
      reason:a.reason||a.source_reason||null,checked_at:a.checked_at,injury_date:a.injury_date,
      expected_return:a.expected_return,suspension_fixture:a.suspension_fixture,
      player:a.player?{id:a.player.id,full_name:a.player.full_name,display_name:a.player.display_name,position:a.player.position,price:a.player.price}:null,
      team:a.team
    }))}
  }
  if(section==='roles'){
    const d=await getRoleSignals()
    return {meta,section,current_run:safeRun(d.run),rows:(d.rows||[]).map(r=>({
      player_id:r.player_id,signal:r.signal,predicted_xi_probability:r.predicted_xi_probability,x_minutes:r.x_minutes,
      last2_xi_probability:r.last2_xi_probability,previous2_xi_probability:r.previous2_xi_probability,
      last2_minutes:r.last2_minutes,previous2_minutes:r.previous2_minutes,
      team_goal_share:r.team_goal_share,team_assist_share:r.team_assist_share,
      player:r.player?{id:r.player.id,full_name:r.player.full_name,display_name:r.player.display_name,position:r.player.position,price:r.player.price}:null,
      team:r.team
    }))}
  }
  if(section==='weekly'){
    const d=await getWeeklyPoints()
    return {meta,section,through_gameweek:d.throughGameweek,final_through_gameweek:d.finalThroughGameweek,
      players:(d.players||[]).map(p=>({id:p.id,full_name:p.full_name,display_name:p.display_name,team:p.team,position:p.position,price:p.price,total_points:p.stats?.actual_points||0,weekly:p.weekly}))}
  }
  if(section==='performance'){
    const d=await getBacktestOverview()
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
    matches:(m.matches||[]).map(matchRow),
    squads:{recommended:squad(a),alternative:squad(b)},
    availability_issues:(av.rows||[]).filter(x=>Number(x.availability_probability??1)<.99).map(x=>({
      player_id:x.player_id,name:x.player?.display_name||x.player?.full_name||null,team:x.team,
      availability_type:x.availability_type,availability_probability:x.availability_probability,
      reason:x.reason||x.source_reason||null,expected_return:x.expected_return||null,suspension_fixture:x.suspension_fixture||null
    }))
  }
},['scout-data-v2'],{revalidate:300})

export async function GET(request){
  try{
    const url=new URL(request.url)
    const requested=String(url.searchParams.get('section')||'all').toLowerCase()
    const allowed=new Set(['all','players','matches','squads','availability','roles','weekly','performance'])
    const unknown=[...url.searchParams.keys()].filter(k=>k!=='section')
    if(unknown.length){
      const canonical=new URL(url.origin+url.pathname)
      if(requested!=='all')canonical.searchParams.set('section',requested)
      return Response.redirect(canonical,308)
    }
    if(!allowed.has(requested))return reply({schema_version:SCHEMA_VERSION,error:'Bilinmeyen bölüm.'},400)
    const full=requested==='performance'&&fullAuthorized(request)
    const payload=await buildCached(requested,full)
    return reply(payload)
  }catch(error){
    reportServerError('api:scout-data',error)
    return reply({schema_version:SCHEMA_VERSION,error:'Scout verisi şu anda hazırlanamadı.'},500)
  }
}
