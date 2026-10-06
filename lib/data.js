import {cache} from 'react'
import {unstable_cache} from 'next/cache'
import {createClient as createServerClient,getVerifiedClaims} from '@/lib/supabase/server'
import {createPublicClient} from '@/lib/supabase/public'
import {CURRENT_SEASON} from '@/lib/rules'
import {reportServerError} from '@/lib/observability'

const offlineBuild=()=>process.env.SCOUT_OFFLINE_BUILD==='1'

const PROJECTION_PUBLIC_COLUMNS='run_id,player_id,opponent_name,venue,xi_probability,appearance_probability,over60_probability,x_minutes,core_xfp,x_bonus,xfp,p25,p75,p90,six_plus_probability,value_score,confidence,expected_goals,expected_assists,mc_standard_error,availability_probability,top25_score,top25_rank,top25_model_version'
const ROLE_PUBLIC_COLUMNS='run_id,player_id,last2_xi_probability,previous2_xi_probability,last2_minutes,previous2_minutes,signal,predicted_xi_probability,x_minutes,team_goal_share,team_assist_share,availability_probability'
const SEASON_STATS_PUBLIC_COLUMNS='season,player_id,through_gameweek,matches_played,starts,minutes,goals,assists,clean_sheets,saves,yellow_cards,red_cards,own_goals,xg_total,xa_total,xa_per90,xa_model_per90,xa_source,xa_confidence,shots,shots_on_target,key_passes,big_chances_created,touches_in_box,crosses,successful_crosses,takeons,successful_takeons,shot_share,chance_creation_share,attack_contribution_share,advanced_source,advanced_through_gameweek,actual_points,six_plus_count,advanced_updated_at,updated_at'
const MATCH_PUBLIC_COLUMNS='run_id,match_id,gameweek,kickoff_at,home_team_id,away_team_id,home_xg,away_xg,home_win_probability,draw_probability,away_win_probability,home_cs_probability,away_cs_probability,btts_probability,over15_probability,over25_probability,over35_probability,three_goal_margin_probability,top_score,top_score_probability,second_score,second_score_probability,third_score,third_score_probability'
const WEEKLY_PUBLIC_COLUMNS='player_id,gameweek,points,minutes,is_final,match_id,base_points,bonus_points'
const TEAM_SEASON_PUBLIC_COLUMNS='team_id,through_gameweek,matches_played,advanced_matches,goals_for,goals_against,xg_total,xga_total,xg_per_match,xga_per_match,xg_diff,shots,opponent_sot,ppda,coverage_note,source_updated_at,updated_at'
const TEAM_TACTICAL_PUBLIC_COLUMNS='season,team_id,through_gameweek,matches_played,attack_xg_per_match,defense_xga_per_match,shots_for_per_match,opponent_sot_per_match,attack_strength_index,defense_strength_index,shot_volume_index,keeper_pressure_index,attack_left_share,attack_center_share,attack_right_share,conceded_left_share,conceded_center_share,conceded_right_share,goals_box_share,goals_outside_box_share,goals_six_yard_share,conceded_box_share,conceded_outside_box_share,conceded_six_yard_share,goals_set_piece_share,goals_counter_share,conceded_set_piece_share,conceded_counter_share,event_shot_sample,event_goal_sample,big_chances,big_chances_missed,shots_on_target_per_match,set_piece_goals,set_piece_xg,set_piece_goals_conceded,set_piece_xga,touches_in_opposition_box,possession_percentage,shot_conversion_rate,aggregate_source,aggregate_updated_at,advanced_profile_through_gameweek,advanced_profile_matches,advanced_profile_source,possession_avg,touches_in_box_per_match,shot_accuracy,xg_per_shot,set_piece_xg_per_match,set_piece_xg_share,crosses_per_match,cross_success_rate,takeons_per_match,takeon_success_rate,chances_created_per_match,ppda_avg,big_chances_missed_per_match,opponent_touches_in_box_per_match,opponent_shots_per_match,opponent_set_piece_xg_per_match,opponent_set_piece_xg_share,opponent_crosses_per_match,opponent_takeons_per_match,inferred_attack_left_share,inferred_attack_center_share,inferred_attack_right_share,inferred_conceded_left_share,inferred_conceded_center_share,inferred_conceded_right_share,channel_method,channel_sample_actions,conceded_channel_sample_actions,coverage,source_updated_at,updated_at'
const AVAILABILITY_CARD_COLUMNS='run_id,player_id,full_name,display_name,short_label,shirt_number,team_id,team_name,position,primary_role,role_side,price,active,availability_type,availability_probability,canonical_reason,checked_at,suspension_end,injury_date,expected_return_date,suspension_fixture'
const ROLE_CARD_COLUMNS='run_id,player_id,full_name,display_name,short_label,shirt_number,team_id,team_name,position,price,active,last2_xi_probability,previous2_xi_probability,last2_minutes,previous2_minutes,signal,predicted_xi_probability,role_x_minutes,team_goal_share,team_assist_share,role_availability_probability'
const MATCH_HISTORY_PUBLIC_COLUMNS='season,match_id,gameweek,kickoff_at,home_team_id,home_team_name,away_team_id,away_team_name,home_goals,away_goals,match_status,fantasy_closure,source_updated_at'

async function checked(scope,promise,context={}){
  const result=await promise
  if(result?.error){reportServerError(scope,result.error,context);throw result.error}
  return result
}

async function fetchPaged(scope,makeQuery,pageSize=1000){
  const rows=[]
  for(let from=0;;from+=pageSize){
    const {data,error}=await makeQuery(from,from+pageSize-1)
    if(error){reportServerError(scope,error,{from,to:from+pageSize-1});throw error}
    rows.push(...(data||[]))
    if(!data||data.length<pageSize)break
  }
  return rows
}

async function _getCurrentRun() {
  if(offlineBuild()) return null
  const supabase=createPublicClient()
  const {data,error}=await supabase.from('scout_model_runs')
    .select('id,gameweek,model_version,generated_at,source_updated_at,simulation_count,status,is_current')
    .eq('is_current',true)
    .order('gameweek',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(error){reportServerError('data:getCurrentRun',error);throw error}
  return data
}

async function _loadPlayersForRun(runId){
  const supabase=createPublicClient()
  const rows=await fetchPaged('data:getPlayersWithProjection',(from,to)=>
    supabase.from('v_current_player_cards_public').select(PLAYER_LIST_COLUMNS)
      .eq('run_id',runId)
      .order('xfp',{ascending:false,nullsFirst:false})
      .range(from,to)
  )
  const mapped=(rows||[]).filter(row=>row.xfp!==null).map(row=>{
    const unavailable=Number(row.projection_availability_probability??1)<=0
    return {
      id:row.player_id,full_name:row.full_name,display_name:row.display_name,short_label:row.short_label,
      shirt_number:row.shirt_number,team_id:row.team_id,team:row.team_name,position:row.position,
      primary_role:row.primary_role,role_side:row.role_side,role_source:row.role_source,role_confidence:row.role_confidence,
      price:Number(row.price||0),active:Boolean(row.active),total_points:Number(row.total_points||0),
      attack_profile:null,
      role_signal:null,
      projection:{
        opponent_name:row.opponent_name,venue:row.venue,xi_probability:row.xi_probability,
        appearance_probability:row.appearance_probability,over60_probability:row.over60_probability,
        x_minutes:row.x_minutes,core_xfp:row.core_xfp,x_bonus:row.x_bonus,xfp:row.xfp,
        p25:null,p75:null,p90:null,six_plus_probability:null,
        value_score:row.value_score,
        availability_probability:row.projection_availability_probability,
        top25_score:null,
        top25_rank:null,
        confidence:row.confidence,
        last2_minutes:row.last2_minutes,previous2_minutes:row.previous2_minutes,
        recent4_minutes:(Number(row.last2_minutes||0)+Number(row.previous2_minutes||0))/2
      },
      availability:row.availability_type?{
        availability_type:row.availability_type,availability_probability:row.availability_probability,
        canonical_reason:row.canonical_reason,checked_at:row.checked_at,suspension_end:row.suspension_end,
        injury_date:row.injury_date,expected_return_date:row.expected_return_date,suspension_fixture:row.suspension_fixture
      }:null
    }
  })
  return mapped
}
const getPlayersForRunShared=unstable_cache(_loadPlayersForRun,['players-for-current-run-v4'],{revalidate:120,tags:['scout-run']})

export async function getProOverlayForRun(runId){
  const {data,error}={data:await getProOverlayForRun(runId),error:null}
  if(error)throw error
  return data||[]
}

async function _loadProPlayersForRun(runId){
  const publicPlayers=await getPlayersForRunShared(runId)
  const supabase=await createServerClient()
  const {data,error}=await supabase.rpc('scout_pro_player_overlay',{p_run_id:runId})
  if(error){reportServerError('data:getProPlayersForRun',error,{run_id:runId});throw error}
  const overlay=new Map((data||[]).map(row=>[Number(row.player_id),row]))
  return publicPlayers.map(player=>{
    const row=overlay.get(Number(player.id))
    if(!row)return player
    const unavailable=Number(row.projection_availability_probability??1)<=0
    return {
      ...player,
      attack_profile:{
        xa_per90:row.xa_per90??null,xa_model_per90:row.xa_model_per90??null,
        xa_source:row.xa_source||null,xa_confidence:row.xa_confidence??null,
        shots:row.shots??null,shots_on_target:row.shots_on_target??null,key_passes:row.key_passes??null,
        big_chances_created:row.big_chances_created??null,touches_in_box:row.touches_in_box??null,
        attack_contribution_share:row.attack_contribution_share??null
      },
      role_signal:{
        last2_xi_probability:row.last2_xi_probability,previous2_xi_probability:row.previous2_xi_probability,
        last2_minutes:row.last2_minutes,previous2_minutes:row.previous2_minutes,signal:row.signal,
        predicted_xi_probability:row.predicted_xi_probability,x_minutes:row.role_x_minutes,
        team_goal_share:row.team_goal_share,team_assist_share:row.team_assist_share,
        availability_probability:row.role_availability_probability
      },
      projection:{
        ...player.projection,
        p25:row.p25,p75:row.p75,p90:row.p90,six_plus_probability:row.six_plus_probability,expected_goals:row.expected_goals,expected_assists:row.expected_assists,
        top25_score:unavailable?null:row.top25_score,top25_rank:unavailable?null:row.top25_rank
      }
    }
  })
}

async function _loadMatchesForRun(runId){
  const supabase=createPublicClient()
  const {data,error}=await supabase.from('v_scout_match_predictions_public')
    .select(MATCH_PUBLIC_COLUMNS).eq('run_id',runId).order('kickoff_at')
  if(error){reportServerError('data:getMatchesForRun',error,{run_id:runId});throw error}
  return data||[]
}
const getMatchesForRunShared=unstable_cache(_loadMatchesForRun,['matches-for-current-run-v1'],{revalidate:120,tags:['scout-run']})

async function _getPlayersWithProjection(limit = 1000) {
  if(offlineBuild()) return {run:null,players:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,players:[]}
  const mapped=await getPlayersForRunShared(run.id)
  return {run,players:Number.isFinite(Number(limit))?mapped.slice(0,Math.max(0,Number(limit))):mapped}
}

const PLAYER_LIST_COLUMNS='player_id,full_name,display_name,short_label,shirt_number,team_id,team_name,position,price,active,total_points,opponent_name,venue,xi_probability,appearance_probability,over60_probability,x_minutes,core_xfp,x_bonus,xfp,value_score,projection_availability_probability,confidence,availability_type,availability_probability,canonical_reason,checked_at,suspension_end,injury_date,expected_return_date,suspension_fixture,primary_role,role_side,role_source,role_confidence'
async function _getHomeOverview(){
  if(offlineBuild())return {run:null,best:null,value:null,teamXfpLeader:null,top25:null,playerCount:0,matchCount:0}
  const run=await getCurrentRun()
  if(!run)return {run:null,best:null,value:null,teamXfpLeader:null,top25:null,playerCount:0,matchCount:0}
  const supabase=createPublicClient()
  const [playerRows,matches,freshnessRes]=await Promise.all([
    getPlayersForRunShared(run.id),
    getMatchesForRunShared(run.id),
    supabase.from('v_scout_public_freshness').select('*').eq('run_id',run.id).maybeSingle(),
  ])
  if(freshnessRes?.error){reportServerError('home:freshness',freshnessRes.error,{run_id:run.id});throw freshnessRes.error}
  const rows=(playerRows||[]).filter(row=>row.active&&row.projection?.xfp!==null&&row.projection?.xfp!==undefined)
  const best=[...rows].sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))[0]||null
  const value=[...rows].sort((a,b)=>Number(b.projection?.value_score||0)-Number(a.projection?.value_score||0))[0]||null
  const top25=rows.filter(row=>row.projection?.top25_rank!==null&&row.projection?.top25_rank!==undefined)
    .sort((a,b)=>Number(a.projection?.top25_rank||9999)-Number(b.projection?.top25_rank||9999))[0]||null
  const teamTotals=new Map()
  for(const row of rows){
    const teamId=Number(row.team_id)
    const current=teamTotals.get(teamId)||{id:teamId,name:row.team,total_xfp:0,player_count:0}
    current.total_xfp+=Number(row.projection?.xfp||0)
    current.player_count+=1
    teamTotals.set(teamId,current)
  }
  const teamXfpLeader=[...teamTotals.values()].sort((a,b)=>b.total_xfp-a.total_xfp)[0]||null
  const freshness=freshnessRes.data||null
  const decisionDataAt=freshness?.availability_checked_at||run.source_updated_at||null
  const decisionDataAgeHours=decisionDataAt
    ?Math.max(0,(Date.now()-new Date(decisionDataAt).getTime())/36e5)
    :null
  return {
    run:{...run,decision_data_at:decisionDataAt,decision_data_age_hours:decisionDataAgeHours,freshness},
    best,value,teamXfpLeader,top25,
    playerCount:rows.length,
    matchCount:(matches||[]).length,
  }
}

async function _getSquadPlayerPool(){
  if(offlineBuild())return {run:null,players:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,players:[]}
  const players=(await getPlayersForRunShared(run.id))
    .filter(row=>row.active&&row.projection?.xfp!==null&&row.projection?.xfp!==undefined)
    .sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))
  return {run,players}
}

function attackMatchup(xg){
  const n=Number(xg||0)
  return n>=1.65?'good':n<=1.15?'tough':'neutral'
}
function defenseMatchup(csProbability){
  const n=Number(csProbability||0)
  return n>=.40?'good':n<=.25?'tough':'neutral'
}

async function _getMatches() {
  if(offlineBuild()) return {run:null,matches:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,matches:[]}

  const [matches,{players:fantasyRows},teamDirectory]=await Promise.all([
    getMatchesForRunShared(run.id),
    getPlayersWithProjection(),
    getTeamDirectoryShared(),
  ])

  const teamIds=[...new Set((matches||[]).flatMap(m=>[m.home_team_id,m.away_team_id]).filter(Boolean))]
  const teamIdSet=new Set(teamIds.map(Number))
  const tm=new Map((teamDirectory||[]).filter(t=>teamIdSet.has(Number(t.id))).map(t=>[Number(t.id),t.name]))
  const fantasyMap=new Map()
  const displayName=p=>p?.full_name||p?.display_name||p?.short_label||'—'
  for(const p of fantasyRows||[]){
    const teamId=Number(p?.team_id)
    if(!teamIdSet.has(teamId)||!p?.active)continue
    const item={
      player_id:Number(p.id),name:displayName(p),full_name:p.full_name,position:p.position,
      price:Number(p.price||0),xfp:Number(p.projection?.xfp||0),p90:Number(p.projection?.p90||0),
      x_minutes:Number(p.projection?.x_minutes||0),xi_probability:Number(p.projection?.xi_probability||0),
      availability_probability:Number(p.projection?.availability_probability??1),
    }
    if(item.availability_probability<=0)continue
    const list=fantasyMap.get(teamId)||[]
    list.push(item);fantasyMap.set(teamId,list)
  }

  const fantasySummary=teamId=>{
    const rows=fantasyMap.get(Number(teamId))||[]
    const eligible=rows.filter(p=>p.x_minutes>=20)
    const attackers=eligible.filter(p=>['MID','FWD'].includes(p.position)).sort((a,b)=>b.xfp-a.xfp||b.p90-a.p90)
    const defenders=eligible.filter(p=>['GK','DEF'].includes(p.position)).sort((a,b)=>b.xfp-a.xfp||b.p90-a.p90)
    const values=eligible.filter(p=>p.price>0&&p.x_minutes>=45).sort((a,b)=>(b.xfp/b.price)-(a.xfp/a.price)||b.xfp-a.xfp)
    const ranked=[...rows].sort((a,b)=>b.xfp-a.xfp||b.p90-a.p90)
    return {
      total_xfp:rows.reduce((sum,p)=>sum+Number(p.xfp||0),0),
      top_player:ranked[0]||null,
      top_attack:attackers[0]||null,
      second_attack:attackers[1]||null,
      top_defense:defenders[0]||null,
      best_value:values[0]||null
    }
  }

  return {
    run,
    matches:(matches||[]).map(m=>({
      ...m,
      home_team:tm.get(Number(m.home_team_id)),
      away_team:tm.get(Number(m.away_team_id)),
      home_attack_level:attackMatchup(m.home_xg),
      away_attack_level:attackMatchup(m.away_xg),
      home_defense_level:defenseMatchup(m.home_cs_probability),
      away_defense_level:defenseMatchup(m.away_cs_probability),
      home_fantasy:fantasySummary(m.home_team_id),
      away_fantasy:fantasySummary(m.away_team_id),
    }))
  }
}

async function _getRecommendationBundle(){
  if(offlineBuild())return {run:null,recommended:{run:null,recommendation:null,members:[]},alternative:{run:null,recommendation:null,members:[]}}
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null,recommended:{run:null,recommendation:null,members:[]},alternative:{run:null,recommendation:null,members:[]}}

  const [recommendationRes,playerRows]=await Promise.all([
    checked(
      'data:getRecommendation:recommendations',
      supabase.from('scout_squad_recommendations')
        .select('id,run_id,variant,budget,xi_xfp,captain_xfp,formation,objective,status')
        .eq('run_id',run.id).in('variant',['recommended','alternative']),
      {run_id:run.id}
    ),
    getPlayersForRunShared(run.id),
  ])
  const recRows=recommendationRes.data||[]
  const recIds=recRows.map(row=>row.id).filter(Boolean)
  const {data:members}=recIds.length?await checked(
    'data:getRecommendation:members',
    supabase.from('scout_squad_members')
      .select('recommendation_id,player_id,squad_slot,sort_order,is_captain,xfp,xi_contribution')
      .in('recommendation_id',recIds).order('sort_order'),
    {run_id:run.id}
  ):{data:[]}

  const playerMap=new Map((playerRows||[]).map(row=>[Number(row.id),row]))
  const byRecommendation=new Map()
  for(const member of members||[]){
    const list=byRecommendation.get(member.recommendation_id)||[]
    const p=playerMap.get(Number(member.player_id))||null
    list.push({
      ...member,
      xfp:Number(p?.projection?.xfp??member.xfp??0),
      p90:Number(p?.projection?.p90||0),
      player:p?{
        id:p.id,full_name:p.full_name,display_name:p.display_name,short_label:p.short_label,
        shirt_number:p.shirt_number,position:p.position,price:Number(p.price||0),team_id:p.team_id
      }:null,
      team:p?.team||'—'
    })
    byRecommendation.set(member.recommendation_id,list)
  }

  const build=variant=>{
    const recommendation=recRows.find(row=>row.variant===variant)||null
    return {
      run,recommendation,
      members:recommendation?(byRecommendation.get(recommendation.id)||[]):[]
    }
  }
  return {run,recommended:build('recommended'),alternative:build('alternative')}
}

const getRecommendationBundleShared=unstable_cache(_getRecommendationBundle,['squad-recommendation-bundle-v1'],{revalidate:60,tags:['scout-run']})

async function _getRecommendation(variant = 'recommended') {
  const bundle=await getRecommendationBundleShared()
  return variant==='alternative'?bundle.alternative:bundle.recommended
}

const getRecommendationShared=unstable_cache(_getRecommendation,['squad-recommendation-v3'],{revalidate:60,tags:['scout-run']})

async function _getAvailability() {
  if(offlineBuild()) return {run:null,rows:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,rows:[]}
  const players=await getPlayersForRunShared(run.id)
  const rows=(players||[])
    .filter(p=>p.availability&&['injuries','suspensions'].includes(p.availability.availability_type))
    .sort((a,b)=>Number(a.availability?.availability_probability??1)-Number(b.availability?.availability_probability??1))
    .map(p=>({
      run_id:run.id,player_id:p.id,...p.availability,
      player:{id:p.id,full_name:p.full_name,display_name:p.display_name,short_label:p.short_label,
        shirt_number:p.shirt_number,position:p.position,primary_role:p.primary_role,role_side:p.role_side,
        team_id:p.team_id,price:p.price,active:p.active},
      team:p.team
    }))
  return {run,rows}
}

async function _getRoleSignals() {
  if(offlineBuild()) return {run:null,rows:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,rows:[]}
  const players=await _loadProPlayersForRun(run.id)
  const rows=(players||[])
    .filter(p=>p.role_signal?.signal!==null&&p.role_signal?.signal!==undefined)
    .sort((a,b)=>Number(a.id)-Number(b.id))
    .map(p=>({
      run_id:run.id,player_id:p.id,...p.role_signal,
      player:{id:p.id,full_name:p.full_name,display_name:p.display_name,short_label:p.short_label,
        shirt_number:p.shirt_number,position:p.position,team_id:p.team_id,price:p.price,active:p.active},
      team:p.team
    }))
  return {run,rows}
}

const AUTH_PLAN_TTL_MS=30000
const authPlanCache=globalThis.__fanteziAuthPlanCache||(globalThis.__fanteziAuthPlanCache=new Map())

async function _getAuthState() {
  const supabase = await createServerClient()
  const {data:claimsData,error:claimsError}=await getVerifiedClaims(supabase)
  if(claimsError){reportServerError('data:getAuthState:claims',claimsError);throw claimsError}
  const userId=claimsData?.claims?.sub||null
  if (!userId) return { userId:null, email:null, plan:'free', tier:'visitor', signedIn:false }

  const now=Date.now()
  const cached=authPlanCache.get(userId)
  let sub=cached&&cached.expiresAt>now?cached.sub:null
  if(!sub){
    const result=await checked('data:getAuthState:subscription',supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',userId).maybeSingle(),{user_id:userId})
    sub=result.data||null
    authPlanCache.set(userId,{sub,expiresAt:now+AUTH_PLAN_TTL_MS})
    if(authPlanCache.size>500){
      for(const [key,value] of authPlanCache){
        if(value.expiresAt<=now)authPlanCache.delete(key)
        if(authPlanCache.size<=400)break
      }
    }
  }
  const activePro = sub?.plan === 'pro' && ['active','trialing'].includes(sub?.status) && (!sub.valid_until || new Date(sub.valid_until) > new Date())
  return {
    userId,
    email:claimsData.claims.email || null,
    plan:activePro ? 'pro' : 'free',
    tier:activePro ? 'pro' : 'member',
    signedIn:true,
  }
}
export const getAuthState=cache(_getAuthState)


async function _getTeamDirectory(){
  if(offlineBuild())return []
  const supabase=createPublicClient()
  const {data,error}=await supabase.from('scout_teams').select('id,name,short_name,slug,active').order('id',{ascending:true})
  if(error){reportServerError('data:getTeamDirectory',error);throw error}
  return data||[]
}
const getTeamDirectoryShared=unstable_cache(_getTeamDirectory,['team-directory-v1'],{revalidate:3600,tags:['scout-run']})

async function _getTeamSeasonDirectory(){
  if(offlineBuild())return []
  const supabase=createPublicClient()
  const {data,error}=await supabase.from('scout_team_season_stats').select(TEAM_SEASON_PUBLIC_COLUMNS)
  if(error){reportServerError('data:getTeamSeasonDirectory',error);throw error}
  return data||[]
}
const getTeamSeasonDirectoryShared=unstable_cache(_getTeamSeasonDirectory,['team-season-directory-v1'],{revalidate:300,tags:['scout-run']})

async function _getTeamTacticalDirectory(){
  if(offlineBuild())return []
  const supabase=createPublicClient()
  const {data,error}=await supabase.from('scout_team_tactical_profiles').select(TEAM_TACTICAL_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON)
  if(error){reportServerError('data:getTeamTacticalDirectory',error);throw error}
  return data||[]
}
const getTeamTacticalDirectoryShared=unstable_cache(_getTeamTacticalDirectory,['team-tactical-directory-v1'],{revalidate:300,tags:['scout-run']})

async function _getPlayerDetail(playerId) {
  if(offlineBuild())return null
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  const id=Number(playerId)
  if(!Number.isFinite(id)||!run)return null

  const [playerRows,seasonRes,modelFeaturesRes,weeklyOverview,replayRes,liveHistoryRes,teamDirectory,runMatches]=await Promise.all([
    getPlayersForRunShared(run.id),
    checked('data:getPlayerDetail:season',supabase.from('scout_player_season_stats').select(SEASON_STATS_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON).eq('player_id',id).maybeSingle(),{player_id:id}),
    checked('data:getPlayerDetail:modelFeatures',supabase.from('v_scout_player_model_features').select('player_id,effective_xa_per90').eq('player_id',id).maybeSingle(),{player_id:id}),
    getWeeklyPointsShared(),
    checked('data:getPlayerDetail:replay',supabase.from('v_scout_replay_players_public').select('gameweek,predicted_xfp,actual_points,predicted_minutes,actual_minutes').eq('player_id',id).not('actual_points','is',null).order('gameweek',{ascending:true}).limit(12),{player_id:id}),
    checked('data:getPlayerDetail:liveHistory',supabase.from('v_scout_backtest_players_public').select('gameweek,predicted_xfp,actual_points,predicted_minutes,actual_minutes,prediction_mode').eq('player_id',id).eq('prediction_mode','live_frozen').not('actual_points','is',null).order('gameweek',{ascending:true}).limit(12),{player_id:id}),
    getTeamDirectoryShared(),
    getMatchesForRunShared(run.id),
  ])

  const base=(playerRows||[]).find(row=>Number(row.id)===id)
  if(!base)return null
  const player={...base,team:base.team||'—'}
  const projection=base.projection?{...base.projection,run_id:run.id,player_id:id}:null
  const availability=base.availability?{...base.availability,run_id:run.id,player_id:id}:null
  const role=base.role_signal?{...base.role_signal,run_id:run.id,player_id:id}:null

  const teamMap=new Map((teamDirectory||[]).map(t=>[Number(t.id),t]))
  const matches=(runMatches||[]).filter(m=>Number(m.home_team_id)===Number(player.team_id)||Number(m.away_team_id)===Number(player.team_id))
  const fixtures=matches.map(m=>{
    const opponentId=Number(m.home_team_id)===Number(player.team_id)?Number(m.away_team_id):Number(m.home_team_id)
    return {...m,opponent:teamMap.get(opponentId)||null,venue:Number(m.home_team_id)===Number(player.team_id)?'HOME':'AWAY'}
  })
  if(projection&&!projection.opponent_name&&fixtures.length){
    projection.opponent_name=fixtures.map(f=>f.opponent?.name).filter(Boolean).join(' + ')||null
  }

  const historicalRows=(replayRes.data||[]).map(row=>({
    ...row,
    history_mode:'historical_replay'
  }))
  const liveRows=(liveHistoryRes.data||[]).map(row=>({...row,history_mode:'live_frozen'}))
  const historyMap=new Map()
  for(const row of [...historicalRows,...liveRows])historyMap.set(Number(row.gameweek),row)
  const performanceHistory=[...historyMap.values()].sort((a,b)=>Number(a.gameweek)-Number(b.gameweek)).slice(-12)

  return {
    run,
    player,
    projection,
    availability,
    role,
    season:seasonRes.data||null,
    modelFeatures:modelFeaturesRes.data||null,
    weekly:(weeklyOverview.players||[]).find(row=>Number(row.id)===id)?.weekly||[],
    replay:performanceHistory,
    matches:fixtures,
    match:fixtures[0]||null,
  }
}

export async function getPlayerDetailPro(playerId,runId){
  const id=Number(playerId)
  if(!Number.isFinite(id))return null
  const supabase=await createServerClient()
  const [{data:cards,error:cardsError},{data:history,error:historyError}]=await Promise.all([
    supabase.rpc('scout_pro_player_overlay',{p_run_id:runId||null}),
    supabase.rpc('scout_pro_player_history',{p_player_id:id})
  ])
  if(cardsError)throw cardsError;if(historyError)throw historyError
  const row=(cards||[]).find(x=>Number(x.player_id)===id)||null
  return {projection:row?{p25:row.p25,p75:row.p75,p90:row.p90,six_plus_probability:row.six_plus_probability,expected_goals:row.expected_goals,expected_assists:row.expected_assists,top25_score:row.top25_score,top25_rank:row.top25_rank}:null,history:history||[]}
}

async function _getWeeklyPoints() {
  if(offlineBuild()) return {run:null,throughGameweek:0,finalThroughGameweek:0,players:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,throughGameweek:0,finalThroughGameweek:0,players:[]}
  const supabase=createPublicClient()
  const [playerRows,weeklyRes]=await Promise.all([
    getPlayersForRunShared(run.id),
    checked(
      'data:getWeeklyPoints:summary',
      supabase.rpc('scout_public_weekly_points',{p_season:CURRENT_SEASON}),
      {run_id:run.id}
    )
  ])
  const weeklyRows=weeklyRes.data||[]
  const statMap=new Map(weeklyRows.map(row=>[Number(row.player_id),row]))
  let finalThroughGameweek=0
  for(const row of weeklyRows){
    for(const week of row.weekly||[]){
      finalThroughGameweek=Math.max(finalThroughGameweek,Number(week.gameweek)||0)
    }
  }
  const throughGameweek=Math.max(finalThroughGameweek,Number(run.gameweek||0))
  const players=(playerRows||[])
    .filter(p=>p.active)
    .map(p=>{
      const stats=statMap.get(Number(p.id))||null
      return {
        id:p.id,full_name:p.full_name,display_name:p.display_name,short_label:p.short_label,
        shirt_number:p.shirt_number,team_id:p.team_id,position:p.position,price:p.price,active:p.active,
        team:p.team||'—',
        stats:stats?{
          player_id:Number(stats.player_id),actual_points:Number(stats.actual_points||0),
          matches_played:Number(stats.matches_played||0),minutes:Number(stats.minutes||0),
          six_plus_count:Number(stats.six_plus_count||0)
        }:null,
        weekly:Array.isArray(stats?.weekly)?stats.weekly:[],
      }
    })
  return {run,throughGameweek,finalThroughGameweek,players}
}


async function _getTeamDetail(teamId) {
  if(offlineBuild())return null
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  const id=Number(teamId)
  if(!Number.isFinite(id))return null

  const [teamDirectory,seasonDirectory,tacticalDirectory,historyRes,runMatches,playerRows,weeklyOverview]=await Promise.all([
    getTeamDirectoryShared(),
    getTeamSeasonDirectoryShared(),
    getTeamTacticalDirectoryShared(),
    checked('data:getTeamDetail:history',supabase.from('scout_match_history').select(MATCH_HISTORY_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON).or('home_team_id.eq.'+id+',away_team_id.eq.'+id).order('gameweek',{ascending:false}).limit(34),{team_id:id}),
    run?getMatchesForRunShared(run.id):Promise.resolve([]),
    run?getPlayersForRunShared(run.id):Promise.resolve([]),
    run?getWeeklyPointsShared():Promise.resolve({players:[]}),
  ])
  const teamMap=new Map((teamDirectory||[]).map(row=>[Number(row.id),row]))
  const team=teamMap.get(id)||null
  if(!team)return null
  const season=(seasonDirectory||[]).find(row=>Number(row.team_id)===id)||null
  const tactical=(tacticalDirectory||[]).find(row=>Number(row.team_id)===id)||null

  const players=(playerRows||[])
    .filter(row=>Number(row.team_id)===id)
    .sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))

  const playerIdSet=new Set(players.map(p=>Number(p.id)))
  const fantasyByGameweek={}
  for(const p of weeklyOverview.players||[]){
    if(!playerIdSet.has(Number(p.id)))continue
    for(const row of p.weekly||[]){
      const gw=Number(row.gameweek)
      fantasyByGameweek[gw]=(fantasyByGameweek[gw]||0)+Number(row.points||0)
    }
  }

  const currentMatches=(runMatches||[]).filter(m=>Number(m.home_team_id)===id||Number(m.away_team_id)===id)
  const fixtures=currentMatches.map(m=>{
    const opponentId=Number(m.home_team_id)===id?Number(m.away_team_id):Number(m.home_team_id)
    return {...m,opponent:teamMap.get(opponentId)||null,venue:Number(m.home_team_id)===id?'HOME':'AWAY'}
  })

  return {
    run,team,season,tactical,history:historyRes.data||[],
    currentMatches:fixtures,currentMatch:fixtures[0]||null,
    opponent:fixtures[0]?.opponent||null,players,fantasyByGameweek,
  }
}

async function _getBacktestOverview() {
  if(offlineBuild())return {currentRun:null,currentRunQa:null,replayWeeks:[],liveWeeks:[],learning:[],replayPlayers:[],livePlayers:[],preseasonCoverage:{teams:0,players:0,activePlayers:0,averagePlayerConfidence:null}}
  const supabase=createPublicClient()
  const [replayWeeksRes,liveWeeksRes,learningRes,preseasonTeamsRes,preseasonPlayersRes,activePlayersRes,currentRunRes]=await Promise.all([
    checked('data:getBacktestOverview:replayWeeks',supabase.from('v_scout_replay_weeks_public').select('gameweek,status,data_through_gameweek,simulation_count,player_sample,average_point_error,model_tendency,large_miss_score,ranking_alignment,average_minute_error,data_confidence,main_learning,updated_at').order('gameweek',{ascending:true})),
    checked('data:getBacktestOverview:liveWeeks',supabase.from('scout_backtest_weeks').select('gameweek,prediction_mode,status,training_through_gameweek,model_version,run_id,snapshot_at,prediction_count,actual_count,minute_sample,fp_sample,minute_mae,fp_mae,fp_bias,fp_rmse,spearman,top25_hit_rate,six_plus_brier,six_plus_calibration_error,recommended_xi_points,optimal_xi_points,captain_points,best_captain_points,data_confidence,notes,updated_at,band_hit_rate,band_calibration_gap,average_band_width,average_outside_distance,core_band_hit_rate,core_band_calibration_gap').order('gameweek',{ascending:true})),
    checked('data:getBacktestOverview:learning',supabase.from('scout_learning_log').select('id,after_gameweek,detected_at,component,segment,sample_size,signal,proposed_adjustment,applied_adjustment,status,summary_tr').order('after_gameweek',{ascending:false}).order('detected_at',{ascending:false}).limit(30)),
    checked('data:getBacktestOverview:preseasonTeams',supabase.from('scout_preseason_team_priors').select('team_id').eq('season',CURRENT_SEASON).eq('prior_version','cold-start-v1')),
    checked('data:getBacktestOverview:preseasonPlayers',supabase.from('scout_preseason_player_priors').select('player_id,prior_confidence').eq('season',CURRENT_SEASON).eq('prior_version','cold-start-v1')),
    checked('data:getBacktestOverview:activePlayers',supabase.from('scout_players').select('id').eq('active',true)),
    checked('data:getBacktestOverview:currentRun',supabase.from('scout_model_runs').select('id,gameweek,model_version,generated_at,simulation_count,status,is_current').eq('is_current',true).maybeSingle()),
  ])
  const replayWeeks=replayWeeksRes.data||[],liveWeeks=liveWeeksRes.data||[],learning=learningRes.data||[]
  const preseasonTeams=preseasonTeamsRes.data||[],preseasonPlayers=preseasonPlayersRes.data||[],activePlayers=activePlayersRes.data||[]
  const currentRun=currentRunRes.data||null

  let currentRunQa=null
  if(currentRun?.id){
    const {data:qaResult}=await checked(
      'data:getBacktestOverview:qaResult',
      supabase.from('scout_run_qa_results').select('model_qa,data_integrity_qa,pass,recorded_at').eq('run_id',currentRun.id).maybeSingle(),
      {run_id:currentRun.id}
    )
    currentRunQa=qaResult?{...(qaResult.model_qa||{}),data_integrity:qaResult.data_integrity_qa||null,pass:Boolean(qaResult.pass),recorded_at:qaResult.recorded_at}:null
  }

  const latestReplayClosed=[...replayWeeks].reverse().find(w=>w.status==='closed')
  const latestLiveClosed=[...liveWeeks].reverse().find(w=>w.status==='closed')
  let replayPlayers=[],livePlayers=[]

  if(latestReplayClosed){
    const {data}=await checked(
      'data:getBacktestOverview:replayPlayers',
      supabase.from('v_scout_replay_players_public')
        .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,point_error,abs_point_error,main_error_area,data_confidence')
        .eq('gameweek',latestReplayClosed.gameweek).not('actual_points','is',null).order('abs_point_error',{ascending:false}).limit(20),
      {gameweek:latestReplayClosed.gameweek}
    )
    replayPlayers=data||[]
  }

  if(latestLiveClosed){
    const {data}=await checked(
      'data:getBacktestOverview:livePlayers',
      supabase.from('scout_backtest_players')
        .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,p25,p90,prediction_error,abs_error,band_status,outside_band_distance,error_component,data_confidence')
        .eq('gameweek',latestLiveClosed.gameweek).not('actual_points','is',null).order('abs_error',{ascending:false}).limit(20),
      {gameweek:latestLiveClosed.gameweek}
    )
    livePlayers=data||[]
  }

  return {
    currentRun,currentRunQa,replayWeeks,liveWeeks,learning,replayPlayers,livePlayers,
    preseasonCoverage:{
      teams:preseasonTeams.length,
      players:preseasonPlayers.length,
      activePlayers:activePlayers.length,
      averagePlayerConfidence:preseasonPlayers.length
        ?preseasonPlayers.reduce((s,p)=>s+Number(p.prior_confidence||0),0)/preseasonPlayers.length:null,
    },
  }
}


async function _getBacktestSummary(){
  if(offlineBuild())return {currentRun:null,currentRunQa:null,replayWeeks:[],learning:[]}
  const supabase=createPublicClient()
  const [replayWeeksRes,learningRes,currentRunRes]=await Promise.all([
    checked(
      'data:getBacktestSummary:replayWeeks',
      supabase.from('v_scout_replay_weeks_public')
        .select('gameweek,status,player_sample,average_point_error,ranking_alignment,average_minute_error')
        .order('gameweek',{ascending:true})
    ),
    checked(
      'data:getBacktestSummary:learning',
      supabase.from('scout_learning_log')
        .select('id,after_gameweek,component,status,summary_tr,signal')
        .order('after_gameweek',{ascending:false}).order('detected_at',{ascending:false}).limit(30)
    ),
    checked(
      'data:getBacktestSummary:currentRun',
      supabase.from('scout_model_runs')
        .select('id,gameweek,model_version,generated_at,simulation_count,status,is_current')
        .eq('is_current',true).maybeSingle()
    ),
  ])
  const currentRun=currentRunRes.data||null
  let currentRunQa=null
  if(currentRun?.id){
    const {data:qaResult}=await checked(
      'data:getBacktestSummary:qaResult',
      supabase.from('scout_run_qa_results')
        .select('model_qa,data_integrity_qa,pass,recorded_at')
        .eq('run_id',currentRun.id).maybeSingle(),
      {run_id:currentRun.id}
    )
    currentRunQa=qaResult?{
      ...(qaResult.model_qa||{}),
      data_integrity:qaResult.data_integrity_qa||null,
      pass:Boolean(qaResult.pass),
      recorded_at:qaResult.recorded_at,
    }:null
  }
  return {
    currentRun,
    currentRunQa,
    replayWeeks:replayWeeksRes.data||[],
    learning:learningRes.data||[],
  }
}


function clampFixtureFactor(value){return Math.max(.82,Math.min(1.18,Number(value)||1))}
function fixtureLevelFromFactor(value){return value>=1.045?'good':value<=.955?'tough':'neutral'}

async function _getFutureFixturePlan(startGameweek,horizon=5){
  if(offlineBuild())return {startGameweek:Number(startGameweek||0),horizon:Number(horizon||0),byTeam:{}}
  const start=Math.max(1,Number(startGameweek)||1)
  const span=Math.max(1,Math.min(8,Number(horizon)||5))
  const supabase=createPublicClient()
  const [{data:fixtures},teamDirectory,seasonDirectory]=await Promise.all([
    checked('data:getFutureFixturePlan:fixtures',supabase.from('fixtures').select('gameweek,home_team_id,away_team_id,match_date,is_finished').gte('gameweek',start).lte('gameweek',start+span-1).order('gameweek').order('match_date'),{start,horizon:span}),
    getTeamDirectoryShared(),
    getTeamSeasonDirectoryShared(),
  ])
  const teamMap=new Map((teamDirectory||[]).filter(t=>t.active).map(t=>[Number(t.id),t]))
  const seasonMap=new Map((seasonDirectory||[]).map(s=>[Number(s.team_id),s]))
  const stats=[...seasonMap.values()]
  const avgXg=stats.length?stats.reduce((sum,s)=>sum+Number(s.xg_per_match||0),0)/stats.length:1.4
  const avgXga=stats.length?stats.reduce((sum,s)=>sum+Number(s.xga_per_match||0),0)/stats.length:1.4
  const byTeam={}
  const add=(teamId,oppId,venue,row)=>{
    const opp=seasonMap.get(Number(oppId))||{}
    const venueBoost=venue==='HOME'?.025:-.01
    const attackFactor=clampFixtureFactor(1+((Number(opp.xga_per_match||avgXga)-avgXga)/Math.max(.5,avgXga))*.16+venueBoost)
    const defenseFactor=clampFixtureFactor(1+((avgXg-Number(opp.xg_per_match||avgXg))/Math.max(.5,avgXg))*.16+venueBoost)
    const overallFactor=(attackFactor+defenseFactor)/2
    const item={gameweek:Number(row.gameweek),opponent_id:Number(oppId),opponent:teamMap.get(Number(oppId))?.name||'—',venue,match_date:row.match_date||null,attack_factor:attackFactor,defense_factor:defenseFactor,factor:overallFactor,level:fixtureLevelFromFactor(overallFactor)}
    byTeam[teamId]=[...(byTeam[teamId]||[]),item]
  }
  for(const row of fixtures||[]){
    add(Number(row.home_team_id),Number(row.away_team_id),'HOME',row)
    add(Number(row.away_team_id),Number(row.home_team_id),'AWAY',row)
  }
  for(const key of Object.keys(byTeam))byTeam[key].sort((a,b)=>a.gameweek-b.gameweek)
  return {startGameweek:start,horizon:span,byTeam}
}

async function _getTeamFixturesOverview(){
  if(offlineBuild())return {run:null,teams:[]}
  const run=await getCurrentRun()
  if(!run)return {run:null,teams:[]}

  const [matches,teamDirectory,seasonDirectory,tacticalDirectory,playerRows,futurePlan]=await Promise.all([
    getMatchesForRunShared(run.id),
    getTeamDirectoryShared(),
    getTeamSeasonDirectoryShared(),
    getTeamTacticalDirectoryShared(),
    getPlayersForRunShared(run.id),
    getFutureFixturePlanShared(Number(run.gameweek)+1,4),
  ])
  const teamIds=[...new Set(matches.flatMap(m=>[m.home_team_id,m.away_team_id]).filter(Boolean).map(Number))]
  if(!teamIds.length)return {run,teams:[]}
  const teamIdSet=new Set(teamIds)
  const visibleTeams=(teamDirectory||[]).filter(t=>teamIdSet.has(Number(t.id)))

  const tm=new Map(visibleTeams.map(t=>[Number(t.id),t]))
  const seasonMap=new Map((seasonDirectory||[]).map(row=>[Number(row.team_id),row]))
  const tacticalMap=new Map((tacticalDirectory||[]).map(row=>[Number(row.team_id),row]))
  const xfpMap=new Map()
  for(const row of playerRows||[]){
    if(!row.active||Number(row.projection?.availability_probability??1)<=0)continue
    const id=Number(row.team_id)
    if(!teamIdSet.has(id))continue
    xfpMap.set(id,(xfpMap.get(id)||0)+Number(row.projection?.xfp||0))
  }

  const fixturesByTeam=new Map(teamIds.map(id=>[Number(id),[]]))
  for(const m of matches){
    const homeId=Number(m.home_team_id),awayId=Number(m.away_team_id)
    fixturesByTeam.get(homeId)?.push({
      opponent_id:awayId,opponent:tm.get(awayId)?.name||'—',venue:'HOME',
      xg:Number(m.home_xg||0),opp_xg:Number(m.away_xg||0),
      win:Number(m.home_win_probability||0),cs:Number(m.home_cs_probability||0),
      kickoff_at:m.kickoff_at||null,
    })
    fixturesByTeam.get(awayId)?.push({
      opponent_id:homeId,opponent:tm.get(homeId)?.name||'—',venue:'AWAY',
      xg:Number(m.away_xg||0),opp_xg:Number(m.home_xg||0),
      win:Number(m.away_win_probability||0),cs:Number(m.away_cs_probability||0),
      kickoff_at:m.kickoff_at||null,
    })
  }

  const average=(rows,key)=>rows.length?rows.reduce((sum,row)=>sum+Number(row[key]||0),0)/rows.length:0
  const band=(value,good,bad)=>value>=good?'good':value<=bad?'tough':'neutral'

  const teams=visibleTeams.map(team=>{
    const id=Number(team.id)
    const fixtures=fixturesByTeam.get(id)||[]
    const season=seasonMap.get(id)||{}
    const tactical=tacticalMap.get(id)||{}
    const xg=average(fixtures,'xg')
    const oppXg=average(fixtures,'opp_xg')
    const win=average(fixtures,'win')
    const cs=average(fixtures,'cs')
    const attackLevel=band(xg,1.65,1.15)
    const defenseLevel=band(cs,.40,.25)
    const currentLevel=attackLevel==='good'&&defenseLevel!=='tough'?'good':attackLevel==='tough'&&defenseLevel!=='good'?'tough':defenseLevel==='good'&&attackLevel!=='tough'?'good':defenseLevel==='tough'&&attackLevel!=='good'?'tough':'neutral'
    const currentStrip=fixtures.slice(0,1).map(f=>({gameweek:Number(run.gameweek),opponent:f.opponent,opponent_id:f.opponent_id,venue:f.venue,level:currentLevel,factor:1}))
    const futureStrip=futurePlan?.byTeam?.[id]||[]
    return {
      id,
      name:team.name,
      short_name:team.short_name||team.name,
      fixtures,
      opponent:fixtures.map(f=>f.opponent).join(' + ')||'—',
      venue:fixtures.length===1?(fixtures[0].venue==='HOME'?'Ev sahibi':'Deplasman'):(fixtures.map(f=>f.venue==='HOME'?'Ev sahibi':'Deplasman').join(' + ')||'—'),
      xg,oppXg,win,cs,
      attack_level:attackLevel,
      defense_level:defenseLevel,
      fixture_strip:[...currentStrip,...futureStrip].slice(0,5),
      total_xfp:Number(xfpMap.get(id)||0),
      matches_played:Number(season.matches_played||0),
      goals_for:Number(season.goals_for||0),
      goals_against:Number(season.goals_against||0),
      season_xg_per_match:Number(season.xg_per_match||0),
      season_xga_per_match:Number(season.xga_per_match||0),
      xg_diff:Number(season.xg_diff||0),
      shots:Number(season.shots||0),
      opponent_sot:Number(season.opponent_sot||0),
      possession:Number(tactical.possession_avg??tactical.possession_percentage??0),
      shots_on_target_per_match:Number(tactical.shots_on_target_per_match||0),
      touches_in_box_per_match:Number(tactical.touches_in_box_per_match||0),
      big_chances_per_match:Number(tactical.big_chances||0)/(Number(tactical.matches_played||0)||1),
      attack_strength_index:Number(tactical.attack_strength_index||0),
      defense_strength_index:Number(tactical.defense_strength_index||0),
    }
  }).sort((a,b)=>a.name.localeCompare(b.name,'tr'))

  return {run,teams}
}

function normalizePlayerSearch(value){
  return String(value||'')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i')
}

async function _getPlayersPage(options={}){
  const {run,players:publicPlayers}=await _getPlayersWithProjection()
  const players=options.pro&&run?await _loadProPlayersForRun(run.id):publicPlayers
  const q=String(options.q||'').trim()
  const pos=String(options.pos||'')
  const team=String(options.team||'')
  const sort=String(options.sort||'xfp')
  const dir=String(options.dir||'desc')==='asc'?1:-1
  const pageSize=Math.max(1,Math.min(100,Number(options.pageSize)||50))
  const page=Math.max(1,Number(options.page)||1)
  const needle=normalizePlayerSearch(q)
  const val=(p,k)=>{
    if(k==='name')return p.full_name||p.display_name||p.short_label||''
    if(k==='team')return p.team||''
    if(k==='pos')return p.position||''
    if(k==='opp')return p.projection?.opponent_name||''
    if(k==='price')return Number(p.price||0)
    if(k==='points')return Number(p.total_points||0)
    if(k==='xi')return Number(p.projection?.xi_probability||0)
    if(k==='minutes')return Number(p.projection?.x_minutes||0)
    if(k==='p25')return Number(p.projection?.p25||0)
    if(k==='p90')return Number(p.projection?.p90||0)
    if(k==='six')return Number(p.projection?.six_plus_probability||0)
    if(k==='xg')return Number(p.projection?.expected_goals||0)
    if(k==='xa')return Number(p.projection?.expected_assists||0)
    if(k==='value')return Number(p.projection?.value_score||0)
    return Number(p.projection?.xfp||0)
  }
  const filtered=players.filter(p=>
    (!pos||p.position===pos)&&
    (!team||p.team===team)&&
    (!needle||normalizePlayerSearch(
      (p.full_name||'')+' '+(p.display_name||'')+' '+(p.short_label||'')+' '+(p.team||'')+' '+
      (p.projection?.opponent_name||'')+' '+(p.primary_role||'')+' '+(p.role_side||'')
    ).includes(needle))
  ).sort((a,b)=>{
    const av=val(a,sort),bv=val(b,sort)
    return typeof av==='string'?dir*av.localeCompare(bv,'tr'):dir*(av-bv)
  })
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize))
  const safePage=Math.min(page,pageCount)
  const start=(safePage-1)*pageSize
  return {
    run,
    players:filtered.slice(start,start+pageSize),
    total:filtered.length,
    page:safePage,
    pageCount,
    teams:[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),
    filters:{q,pos,team,sort,dir:dir===1?'asc':'desc'}
  }
}


async function _getMySquadOverview(){
  if(offlineBuild())return null
  const supabase=await createServerClient()
  const {data:claimsData}=await getVerifiedClaims(supabase)
  const userId=claimsData?.claims?.sub||null
  if(!userId)return null
  const run=await getCurrentRun()
  if(!run)return null

  const [squadRes,gameweekRes,playerRows]=await Promise.all([
    checked('data:getMySquadOverview:squad',supabase.from('scout_user_squads').select('id,bank').eq('user_id',userId).eq('is_active',true).maybeSingle(),{user_id:userId}),
    checked('data:getMySquadOverview:gameweek',supabase.from('scout_gameweeks').select('gameweek,deadline_at,locked_at').eq('gameweek',run.gameweek).maybeSingle(),{gameweek:run.gameweek}),
    getPlayersForRunShared(run.id),
  ])
  const squad=squadRes.data||null
  const gameweek=gameweekRes.data||null
  if(!squad)return {run,gameweek,hasSquad:false,members:[],xiXfp:0,riskCount:0}

  const {data:members}=await checked('data:getMySquadOverview:members',supabase.from('scout_user_squad_members').select('player_id,is_captain,bench_order').eq('squad_id',squad.id),{squad_id:squad.id})
  const ids=new Set((members||[]).map(row=>Number(row.player_id)).filter(Number.isFinite))
  if(!ids.size)return {run,gameweek,hasSquad:false,members:[],xiXfp:0,riskCount:0}

  const cardMap=new Map((playerRows||[]).filter(p=>ids.has(Number(p.id))).map(p=>[Number(p.id),{
    player_id:p.id,full_name:p.full_name,display_name:p.display_name,short_label:p.short_label,
    team_name:p.team,position:p.position,xfp:Number(p.projection?.xfp||0),
    xi_probability:Number(p.projection?.xi_probability||0),x_minutes:Number(p.projection?.x_minutes||0),
    projection_availability_probability:Number(p.projection?.availability_probability??1),
    availability_type:p.availability?.availability_type||null,canonical_reason:p.availability?.canonical_reason||null
  }]))
  const enriched=(members||[]).map(row=>({...row,player:cardMap.get(Number(row.player_id))||null}))
  const xi=enriched.filter(row=>row.bench_order===null&&row.player)
  const captain=xi.find(row=>row.is_captain)||null
  const xiBase=xi.reduce((sum,row)=>sum+Number(row.player?.xfp||0),0)
  const risks=enriched.filter(row=>{
    const p=row.player
    if(!p)return true
    return Number(p.projection_availability_probability??1)<.8||Number(p.xi_probability||0)<.55||Number(p.x_minutes||0)<45
  })
  const top=[...xi].sort((a,b)=>Number(b.player?.xfp||0)-Number(a.player?.xfp||0))[0]||null
  return {run,gameweek,hasSquad:true,bank:Number(squad.bank||0),members:enriched,xiXfp:xiBase+Number(captain?.player?.xfp||0),riskCount:risks.length,topPlayer:top?.player||null,captain:captain?.player||null,riskPlayer:risks[0]?.player||null}
}

async function _getModelHealthOverview(){
  if(offlineBuild())return {run:null}
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null}
  const healthRes=await supabase.rpc('scout_public_model_health',{p_run_id:run.id})
  if(healthRes?.error){reportServerError('health:public-summary',healthRes.error,{run_id:run.id});throw healthRes.error}
  const health=healthRes.data||{}
  const decisionAt=health.decision_at||run.source_updated_at||null
  const ageHours=decisionAt?Math.max(0,(Date.now()-new Date(decisionAt).getTime())/36e5):null
  const qa={pass:health.qa_pass,recorded_at:health.checked_at}
  const gate={qa_pass:health.qa_pass,data_integrity_pass:health.data_integrity_pass,artifacts_pass:health.artifacts_pass,optimizer_pass:health.optimizer_pass,checked_at:health.checked_at}
  return {run,qa,gate,freshness:{availability_checked_at:health.decision_at||null},decisionAt,ageHours,coverage:{projections:Number(health.projections||0),availability:Number(health.availability||0),roles:Number(health.roles||0),teams:Number(health.teams||0)}}
}

const getCurrentRunShared=unstable_cache(_getCurrentRun,['current-run-v2'],{revalidate:20,tags:['scout-run']})
const getHomeOverviewShared=unstable_cache(_getHomeOverview,['home-overview-v2'],{revalidate:60,tags:['scout-run']})
const getMatchesShared=unstable_cache(_getMatches,['matches-v2'],{revalidate:120,tags:['scout-run']})
const getAvailabilityShared=unstable_cache(_getAvailability,['availability-v2'],{revalidate:120,tags:['scout-run']})
const getWeeklyPointsShared=unstable_cache(_getWeeklyPoints,['weekly-points-v2'],{revalidate:300,tags:['scout-run']})
const getBacktestOverviewShared=unstable_cache(_getBacktestOverview,['backtest-overview-v2'],{revalidate:300,tags:['scout-run']})
const getBacktestSummaryShared=unstable_cache(_getBacktestSummary,['backtest-summary-v2'],{revalidate:300,tags:['scout-run']})
const getFutureFixturePlanShared=unstable_cache(_getFutureFixturePlan,['future-fixture-plan-v2'],{revalidate:300,tags:['scout-run']})
const getModelHealthOverviewShared=unstable_cache(_getModelHealthOverview,['model-health-v2'],{revalidate:30,tags:['scout-run']})

export const getCurrentRun=cache(getCurrentRunShared)
export const getPlayersWithProjection=cache(_getPlayersWithProjection)
export const getPlayersPage=cache(_getPlayersPage)
export const getHomeOverview=cache(getHomeOverviewShared)
export const getSquadPlayerPool=cache(_getSquadPlayerPool)
export const getMatches=cache(getMatchesShared)
export const getRecommendation=cache(getRecommendationShared)
export const getAvailability=cache(getAvailabilityShared)
export const getRoleSignals=cache(_getRoleSignals)
const getPlayerDetailShared=unstable_cache(_getPlayerDetail,['player-detail-v2'],{revalidate:300,tags:['scout-run']})
export const getPlayerDetail=cache(getPlayerDetailShared)
export const getWeeklyPoints=cache(getWeeklyPointsShared)
const getTeamDetailShared=unstable_cache(_getTeamDetail,['team-detail-v3'],{revalidate:300,tags:['scout-run']})
const getTeamFixturesOverviewShared=unstable_cache(_getTeamFixturesOverview,['team-fixtures-overview-v2'],{revalidate:300,tags:['scout-run']})
export const getTeamDetail=cache(getTeamDetailShared)
export const getBacktestOverview=cache(getBacktestOverviewShared)
export const getBacktestSummary=cache(getBacktestSummaryShared)
export const getTeamFixturesOverview=cache(getTeamFixturesOverviewShared)
export const getFutureFixturePlan=cache(getFutureFixturePlanShared)
export const getMySquadOverview=cache(_getMySquadOverview)
export const getModelHealthOverview=cache(getModelHealthOverviewShared)
