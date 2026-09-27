import {cache} from 'react'
import {unstable_cache} from 'next/cache'
import {createClient as createServerClient} from '@/lib/supabase/server'
import {createPublicClient} from '@/lib/supabase/public'
import {CURRENT_SEASON} from '@/lib/rules'
import {reportServerError} from '@/lib/observability'

const offlineBuild=()=>process.env.SCOUT_OFFLINE_BUILD==='1'

const PROJECTION_PUBLIC_COLUMNS='run_id,player_id,opponent_name,venue,xi_probability,appearance_probability,over60_probability,x_minutes,core_xfp,x_bonus,xfp,p25,p75,p90,six_plus_probability,value_score,confidence,expected_goals,expected_assists,mc_standard_error,availability_probability,top25_score,top25_rank,top25_model_version'
const ROLE_PUBLIC_COLUMNS='run_id,player_id,last2_xi_probability,previous2_xi_probability,last2_minutes,previous2_minutes,signal,predicted_xi_probability,x_minutes,team_goal_share,team_assist_share,availability_probability'
const SEASON_STATS_PUBLIC_COLUMNS='season,player_id,through_gameweek,matches_played,starts,minutes,goals,assists,clean_sheets,saves,yellow_cards,red_cards,own_goals,xg_total,xa_total,xa_per90,xa_model_per90,xa_source,xa_confidence,shots,shots_on_target,key_passes,big_chances_created,touches_in_box,attack_contribution_share,actual_points,six_plus_count,advanced_updated_at,updated_at'
const MATCH_PUBLIC_COLUMNS='run_id,match_id,gameweek,kickoff_at,home_team_id,away_team_id,home_xg,away_xg,home_win_probability,draw_probability,away_win_probability,home_cs_probability,away_cs_probability,btts_probability,over15_probability,over25_probability,over35_probability,three_goal_margin_probability,top_score,top_score_probability,second_score,second_score_probability,third_score,third_score_probability,method,model_note'
const WEEKLY_PUBLIC_COLUMNS='player_id,gameweek,points,minutes,is_final,match_id,base_points,bonus_points'
const TEAM_SEASON_PUBLIC_COLUMNS='team_id,through_gameweek,matches_played,advanced_matches,goals_for,goals_against,xg_total,xga_total,xg_per_match,xga_per_match,xg_diff,shots,opponent_sot,ppda,coverage_note,source_updated_at,updated_at'
const TEAM_TACTICAL_PUBLIC_COLUMNS='season,team_id,through_gameweek,matches_played,attack_xg_per_match,defense_xga_per_match,shots_for_per_match,opponent_sot_per_match,attack_strength_index,defense_strength_index,shot_volume_index,keeper_pressure_index,attack_left_share,attack_center_share,attack_right_share,conceded_left_share,conceded_center_share,conceded_right_share,goals_box_share,goals_outside_box_share,goals_six_yard_share,conceded_box_share,conceded_outside_box_share,conceded_six_yard_share,goals_set_piece_share,goals_counter_share,conceded_set_piece_share,conceded_counter_share,event_shot_sample,event_goal_sample,coverage,big_chances,big_chances_missed,shots_on_target_per_match,touches_in_opposition_box,possession_percentage,shot_conversion_rate,set_piece_goals,set_piece_xg,set_piece_goals_conceded,set_piece_xga,aggregate_source,aggregate_updated_at,source_updated_at,updated_at'
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

async function _getPlayersWithProjection(limit = 1000) {
  if(offlineBuild()) return {run:null,players:[]}
  const supabase=createPublicClient()
  const rows=await fetchPaged('data:getPlayersWithProjection',(from,to)=>
    supabase.from('v_current_player_cards').select('*')
      .order('xfp',{ascending:false,nullsFirst:false})
      .range(from,to)
  )
  const first=rows?.[0]
  const run=first?{id:first.run_id,gameweek:first.gameweek,generated_at:first.generated_at,source_updated_at:first.source_updated_at,simulation_count:first.simulation_count,status:first.run_status,is_current:first.is_current}:null
  const mapped=(rows||[]).filter(row=>row.xfp!==null).map(row=>{
    const unavailable=Number(row.projection_availability_probability??1)<=0
    return {
      id:row.player_id,full_name:row.full_name,display_name:row.display_name,short_label:row.short_label,
      shirt_number:row.shirt_number,team_id:row.team_id,team:row.team_name,position:row.position,
      primary_role:row.primary_role,role_side:row.role_side,role_source:row.role_source,role_confidence:row.role_confidence,
      price:Number(row.price||0),active:Boolean(row.active),total_points:Number(row.total_points||0),
      attack_profile:{xa_total:row.xa_total,xa_per90:row.xa_per90,xa_model_per90:row.xa_model_per90,xa_source:row.xa_source,xa_confidence:row.xa_confidence,shots:row.shots,shots_on_target:row.shots_on_target,key_passes:row.key_passes,big_chances_created:row.big_chances_created,touches_in_box:row.touches_in_box,attack_contribution_share:row.attack_contribution_share},
      projection:{
        opponent_name:row.opponent_name,venue:row.venue,xi_probability:row.xi_probability,
        appearance_probability:row.appearance_probability,over60_probability:row.over60_probability,
        x_minutes:row.x_minutes,core_xfp:row.core_xfp,x_bonus:row.x_bonus,xfp:row.xfp,
        p25:row.p25,p75:row.p75,p90:row.p90,six_plus_probability:row.six_plus_probability,
        value_score:row.value_score,expected_goals:row.expected_goals,expected_assists:row.expected_assists,
        availability_probability:row.projection_availability_probability,
        top25_score:unavailable?null:row.top25_score,
        top25_rank:unavailable?null:row.top25_rank,
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
  return {run,players:Number.isFinite(Number(limit))?mapped.slice(0,Math.max(0,Number(limit))):mapped}
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
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null,matches:[]}

  const {data:matches,error:matchError}=await supabase.from('scout_match_predictions')
    .select(MATCH_PUBLIC_COLUMNS).eq('run_id',run.id).order('kickoff_at')
  if(matchError){reportServerError('data:getMatches:predictions',matchError);throw matchError}

  const teamIds=[...new Set((matches||[]).flatMap(m=>[m.home_team_id,m.away_team_id]).filter(Boolean))]
  const {data:teams,error:teamError}=teamIds.length
    ?await supabase.from('scout_teams').select('id,name,short_name').in('id',teamIds)
    :{data:[],error:null}
  if(teamError){reportServerError('data:getMatches:teams',teamError);throw teamError}

  const fantasyRows=await fetchPaged('data:getMatches:fantasy',(from,to)=>
    supabase.from('scout_player_projections')
      .select('player_id,xfp,p90,x_minutes,xi_probability,availability_probability,scout_players!inner(team_id,full_name,display_name,short_label,position,price,active)')
      .eq('run_id',run.id)
      .range(from,to)
  )

  const tm=new Map((teams||[]).map(t=>[Number(t.id),t.name]))
  const fantasyMap=new Map()
  const displayName=p=>p?.full_name||p?.display_name||p?.short_label||'—'
  for(const row of fantasyRows){
    const p=row.scout_players
    const teamId=Number(p?.team_id)
    if(!teamIds.map(Number).includes(teamId)||!p?.active)continue
    const item={
      player_id:Number(row.player_id),name:displayName(p),full_name:p.full_name,position:p.position,
      price:Number(p.price||0),xfp:Number(row.xfp||0),p90:Number(row.p90||0),
      x_minutes:Number(row.x_minutes||0),xi_probability:Number(row.xi_probability||0),
      availability_probability:Number(row.availability_probability??1),
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
    return {top_attack:attackers[0]||null,second_attack:attackers[1]||null,top_defense:defenders[0]||null,best_value:values[0]||null}
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


async function _getRecommendation(variant = 'recommended') {
  if(offlineBuild()) return {run:null,recommendation:null,members:[]}
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null,recommendation:null,members:[]}

  const {data:recommendation}=await checked(
    'data:getRecommendation:recommendation',
    supabase.from('scout_squad_recommendations')
      .select('id,run_id,variant,budget,xi_xfp,captain_xfp,formation,objective,status')
      .eq('run_id',run.id).eq('variant',variant).maybeSingle(),
    {variant,run_id:run.id}
  )
  if(!recommendation)return {run,recommendation:null,members:[]}

  const {data:members}=await checked(
    'data:getRecommendation:members',
    supabase.from('scout_squad_members')
      .select('recommendation_id,player_id,squad_slot,sort_order,is_captain,xfp,xi_contribution')
      .eq('recommendation_id',recommendation.id).order('sort_order'),
    {recommendation_id:recommendation.id}
  )
  const ids=(members||[]).map(x=>x.player_id)

  const [{data:players},{data:projections}]=await Promise.all([
    ids.length?checked(
      'data:getRecommendation:players',
      supabase.from('scout_players')
        .select('id,full_name,display_name,short_label,shirt_number,position,price,team_id')
        .in('id',ids)
    ):Promise.resolve({data:[]}),
    ids.length?checked(
      'data:getRecommendation:projections',
      supabase.from('scout_player_projections').select('player_id,p90').eq('run_id',run.id).in('player_id',ids)
    ):Promise.resolve({data:[]}),
  ])
  const teamIds=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const {data:teams}=teamIds.length?await checked(
    'data:getRecommendation:teams',
    supabase.from('scout_teams').select('id,name').in('id',teamIds)
  ):{data:[]}

  const pm=new Map((players||[]).map(p=>[p.id,p]))
  const tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  const projMap=new Map((projections||[]).map(p=>[p.player_id,p]))
  return {
    run,recommendation,
    members:(members||[]).map(m=>({
      ...m,p90:Number(projMap.get(m.player_id)?.p90||0),
      player:pm.get(m.player_id),team:tm.get(pm.get(m.player_id)?.team_id)||'—'
    }))
  }
}

async function _getAvailability() {
  if(offlineBuild()) return {run:null,rows:[]}
  const supabase=createPublicClient()
  const rows=await fetchPaged('data:getAvailability',(from,to)=>
    supabase.from('v_current_player_cards').select('*')
      .not('availability_type','is',null)
      .order('availability_probability',{ascending:true})
      .range(from,to)
  )
  const first=rows?.[0]
  const run=first?{id:first.run_id,gameweek:first.gameweek,generated_at:first.generated_at,source_updated_at:first.source_updated_at,simulation_count:first.simulation_count,status:first.run_status,is_current:first.is_current}:null
  return {run,rows:rows.map(row=>({
    run_id:row.run_id,player_id:row.player_id,availability_type:row.availability_type,
    availability_probability:row.availability_probability,canonical_reason:row.canonical_reason,
    checked_at:row.checked_at,suspension_end:row.suspension_end,injury_date:row.injury_date,
    expected_return_date:row.expected_return_date,suspension_fixture:row.suspension_fixture,
    player:{id:row.player_id,full_name:row.full_name,display_name:row.display_name,short_label:row.short_label,
      shirt_number:row.shirt_number,position:row.position,primary_role:row.primary_role,role_side:row.role_side,team_id:row.team_id,price:row.price,active:row.active},
    team:row.team_name
  }))}
}

async function _getRoleSignals() {
  if(offlineBuild()) return {run:null,rows:[]}
  const supabase=createPublicClient()
  const rows=await fetchPaged('data:getRoleSignals',(from,to)=>
    supabase.from('v_current_player_cards').select('*')
      .not('signal','is',null)
      .order('player_id',{ascending:true})
      .range(from,to)
  )
  const first=rows?.[0]
  const run=first?{id:first.run_id,gameweek:first.gameweek,generated_at:first.generated_at,source_updated_at:first.source_updated_at,simulation_count:first.simulation_count,status:first.run_status,is_current:first.is_current}:null
  return {run,rows:rows.map(row=>({
    run_id:row.run_id,player_id:row.player_id,last2_xi_probability:row.last2_xi_probability,
    previous2_xi_probability:row.previous2_xi_probability,last2_minutes:row.last2_minutes,
    previous2_minutes:row.previous2_minutes,signal:row.signal,
    predicted_xi_probability:row.predicted_xi_probability,x_minutes:row.role_x_minutes,
    team_goal_share:row.team_goal_share,team_assist_share:row.team_assist_share,
    availability_probability:row.role_availability_probability,
    player:{id:row.player_id,full_name:row.full_name,display_name:row.display_name,short_label:row.short_label,
      shirt_number:row.shirt_number,position:row.position,team_id:row.team_id,price:row.price,active:row.active},
    team:row.team_name
  }))}
}


export async function getAuthState() {
  const supabase = await createServerClient()
  const {data:claimsData,error:claimsError}=await supabase.auth.getClaims()
  if(claimsError){reportServerError('data:getAuthState:claims',claimsError);throw claimsError}
  const userId=claimsData?.claims?.sub||null
  if (!userId) return { userId:null, email:null, plan:'free' }
  const {data:sub}=await checked('data:getAuthState:subscription',supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',userId).maybeSingle(),{user_id:userId})
  const activePro = sub?.plan === 'pro' && ['active','trialing'].includes(sub?.status) && (!sub.valid_until || new Date(sub.valid_until) > new Date())
  return { userId, email:claimsData.claims.email || null, plan:activePro ? 'pro' : 'free' }
}


async function _getPlayerDetail(playerId) {
  if(offlineBuild())return null
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  const id=Number(playerId)
  if(!Number.isFinite(id))return null

  const {data:player}=await checked(
    'data:getPlayerDetail:player',
    supabase.from('scout_players')
      .select('id,full_name,display_name,short_label,shirt_number,team_id,position,primary_role,role_side,role_source,role_confidence,price,active')
      .eq('id',id).maybeSingle(),
    {player_id:id}
  )
  if(!player)return null

  const [teamRes,projectionRes,availabilityRes,roleRes,seasonRes,weeklyRes,matchesRes]=await Promise.all([
    checked('data:getPlayerDetail:team',supabase.from('scout_teams').select('id,name,slug').eq('id',player.team_id).maybeSingle(),{player_id:id}),
    run?checked('data:getPlayerDetail:projection',supabase.from('scout_player_projections').select(PROJECTION_PUBLIC_COLUMNS).eq('run_id',run.id).eq('player_id',id).maybeSingle(),{player_id:id,run_id:run.id}):Promise.resolve({data:null}),
    run?checked('data:getPlayerDetail:availability',supabase.from('scout_availability').select('run_id,player_id,availability_type,availability_probability,canonical_reason,checked_at,suspension_end,injury_date,expected_return_date,suspension_fixture').eq('run_id',run.id).eq('player_id',id).maybeSingle(),{player_id:id,run_id:run.id}):Promise.resolve({data:null}),
    run?checked('data:getPlayerDetail:role',supabase.from('scout_role_signals').select(ROLE_PUBLIC_COLUMNS).eq('run_id',run.id).eq('player_id',id).maybeSingle(),{player_id:id,run_id:run.id}):Promise.resolve({data:null}),
    checked('data:getPlayerDetail:season',supabase.from('scout_player_season_stats').select(SEASON_STATS_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON).eq('player_id',id).maybeSingle(),{player_id:id}),
    checked('data:getPlayerDetail:weekly',supabase.from('scout_player_weekly_points').select(WEEKLY_PUBLIC_COLUMNS).eq('player_id',id).eq('is_final',true).order('gameweek',{ascending:true}).limit(34),{player_id:id}),
    run&&player.team_id?checked('data:getPlayerDetail:matches',supabase.from('scout_match_predictions').select(MATCH_PUBLIC_COLUMNS).eq('run_id',run.id).or('home_team_id.eq.'+player.team_id+',away_team_id.eq.'+player.team_id).order('kickoff_at',{ascending:true}),{player_id:id,run_id:run.id}):Promise.resolve({data:[]}),
  ])

  const matches=matchesRes.data||[]
  const opponentIds=[...new Set(matches.map(m=>Number(m.home_team_id)===Number(player.team_id)?m.away_team_id:m.home_team_id).filter(Boolean))]
  const {data:opponents}=opponentIds.length?await checked(
    'data:getPlayerDetail:opponents',
    supabase.from('scout_teams').select('id,name,slug').in('id',opponentIds),
    {player_id:id}
  ):{data:[]}
  const opponentMap=new Map((opponents||[]).map(t=>[Number(t.id),t]))
  const fixtures=matches.map(m=>{
    const opponentId=Number(m.home_team_id)===Number(player.team_id)?Number(m.away_team_id):Number(m.home_team_id)
    return {...m,opponent:opponentMap.get(opponentId)||null,venue:Number(m.home_team_id)===Number(player.team_id)?'HOME':'AWAY'}
  })
  const projection=projectionRes.data?{...projectionRes.data}:null
  if(projection&&!projection.opponent_name&&fixtures.length){
    projection.opponent_name=fixtures.map(f=>f.opponent?.name).filter(Boolean).join(' + ')||null
  }

  return {
    run,
    player:{...player,team:teamRes.data?.name||'—'},
    projection,
    availability:availabilityRes.data||null,
    role:roleRes.data||null,
    season:seasonRes.data||null,
    weekly:weeklyRes.data||[],
    matches:fixtures,
    match:fixtures[0]||null,
  }
}

async function _getWeeklyPoints() {
  if(offlineBuild()) return {run:null,throughGameweek:0,finalThroughGameweek:0,players:[]}
  const supabase = createPublicClient()
  const run = await getCurrentRun()

  const [players,stats,{data:teams,error:teamsError}]=await Promise.all([
    fetchPaged('data:getWeeklyPoints:players',(from,to)=>supabase.from('scout_players')
      .select('id,full_name,display_name,short_label,shirt_number,team_id,position,price,active')
      .eq('active',true).order('id',{ascending:true}).range(from,to)),
    fetchPaged('data:getWeeklyPoints:stats',(from,to)=>supabase.from('scout_player_season_stats')
      .select('player_id,actual_points,matches_played,minutes,six_plus_count')
      .eq('season',CURRENT_SEASON).order('player_id',{ascending:true}).range(from,to)),
    supabase.from('scout_teams').select('id,name').order('id',{ascending:true})
  ])
  if(teamsError){reportServerError('data:getWeeklyPoints:teams',teamsError);throw teamsError}

  // PostgREST/Supabase projects commonly cap a single response around 1,000 rows.
  // Weekly history is larger than that, so fetch deterministic 1,000-row pages.
  const points = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('scout_player_weekly_points')
      .select('player_id,gameweek,points,minutes,is_final')
      .eq('is_final', true)
      .order('gameweek', { ascending: true })
      .order('player_id', { ascending: true })
      .range(from, from + pageSize - 1)

    if(error){reportServerError('data:getWeeklyPoints:history',error,{from});throw error}
    points.push(...(page || []))
    if (!page || page.length < pageSize) break
  }

  const teamMap = new Map((teams || []).map(t => [t.id, t.name]))
  const statMap = new Map((stats || []).map(s => [s.player_id, s]))
  const historyMap = new Map()

  for (const row of points) {
    if (!row.player_id) continue
    const list = historyMap.get(row.player_id) || []
    list.push({gameweek:row.gameweek,points:row.points,minutes:row.minutes,is_final:row.is_final})
    historyMap.set(row.player_id, list)
  }

  const finalThroughGameweek = Math.max(0, ...(points || []).map(x => Number(x.gameweek) || 0))
  const throughGameweek = Math.max(finalThroughGameweek, Number(run?.gameweek || 0))

  return {
    run,
    throughGameweek,
    finalThroughGameweek,
    players: (players || []).map(p => ({
      ...p,
      team: teamMap.get(p.team_id) || '—',
      stats: statMap.get(p.id) || null,
      weekly: historyMap.get(p.id) || [],
    }))
  }
}


async function _getTeamDetail(teamId) {
  if(offlineBuild())return null
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  const id=Number(teamId)
  if(!Number.isFinite(id))return null

  const teamRes=await checked(
    'data:getTeamDetail:team',
    supabase.from('scout_teams').select('id,name,short_name,slug,active').eq('id',id).maybeSingle(),
    {team_id:id}
  )
  const team=teamRes.data
  if(!team)return null

  const [seasonRes,tacticalRes,historyRes,matchesRes,cardRows]=await Promise.all([
    checked('data:getTeamDetail:season',supabase.from('scout_team_season_stats').select(TEAM_SEASON_PUBLIC_COLUMNS).eq('team_id',id).maybeSingle(),{team_id:id}),
    checked('data:getTeamDetail:tactical',supabase.from('scout_team_tactical_profiles').select(TEAM_TACTICAL_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON).eq('team_id',id).maybeSingle(),{team_id:id}),
    checked('data:getTeamDetail:history',supabase.from('scout_match_history').select(MATCH_HISTORY_PUBLIC_COLUMNS).eq('season',CURRENT_SEASON).or('home_team_id.eq.'+id+',away_team_id.eq.'+id).order('gameweek',{ascending:false}).limit(34),{team_id:id}),
    run?checked('data:getTeamDetail:matches',supabase.from('scout_match_predictions').select(MATCH_PUBLIC_COLUMNS).eq('run_id',run.id).or('home_team_id.eq.'+id+',away_team_id.eq.'+id).order('kickoff_at',{ascending:true}),{team_id:id,run_id:run.id}):Promise.resolve({data:[]}),
    fetchPaged('data:getTeamDetail:cards',(from,to)=>supabase.from('v_current_player_cards').select('*').eq('team_id',id).order('position').order('price',{ascending:false}).range(from,to)),
  ])

  const players=(cardRows||[]).map(row=>({
    id:row.player_id,full_name:row.full_name,display_name:row.display_name,short_label:row.short_label,
    shirt_number:row.shirt_number,team_id:row.team_id,position:row.position,primary_role:row.primary_role,role_side:row.role_side,role_source:row.role_source,role_confidence:row.role_confidence,price:Number(row.price||0),active:Boolean(row.active),
    attack_profile:{xa_total:row.xa_total,xa_per90:row.xa_per90,xa_model_per90:row.xa_model_per90,xa_source:row.xa_source,xa_confidence:row.xa_confidence,shots:row.shots,shots_on_target:row.shots_on_target,key_passes:row.key_passes,big_chances_created:row.big_chances_created,touches_in_box:row.touches_in_box,attack_contribution_share:row.attack_contribution_share},
    total_points:Number(row.total_points||0),
    projection:row.xfp===null?null:{
      opponent_name:row.opponent_name,venue:row.venue,xi_probability:row.xi_probability,
      appearance_probability:row.appearance_probability,over60_probability:row.over60_probability,
      x_minutes:row.x_minutes,core_xfp:row.core_xfp,x_bonus:row.x_bonus,xfp:row.xfp,p25:row.p25,p75:row.p75,p90:row.p90,
      six_plus_probability:row.six_plus_probability,value_score:row.value_score,expected_goals:row.expected_goals,
      expected_assists:row.expected_assists,availability_probability:row.projection_availability_probability,
      top25_score:row.top25_score,top25_rank:row.top25_rank,confidence:row.confidence
    },
    availability:row.availability_type?{
      run_id:row.run_id,player_id:row.player_id,availability_type:row.availability_type,
      availability_probability:row.availability_probability,canonical_reason:row.canonical_reason,checked_at:row.checked_at,
      suspension_end:row.suspension_end,injury_date:row.injury_date,expected_return_date:row.expected_return_date,suspension_fixture:row.suspension_fixture
    }:null
  })).sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))

  const playerIds=players.map(p=>p.id)
  const weekly=[]
  if(playerIds.length){
    const pageSize=1000
    for(let from=0;;from+=pageSize){
      const {data:page}=await checked(
        'data:getTeamDetail:weekly',
        supabase.from('scout_player_weekly_points').select('player_id,gameweek,points,minutes,is_final').in('player_id',playerIds).eq('is_final',true).order('gameweek',{ascending:true}).order('player_id',{ascending:true}).range(from,from+pageSize-1),
        {team_id:id,from}
      )
      weekly.push(...(page||[]))
      if(!page||page.length<pageSize)break
    }
  }

  const fantasyByGameweek={}
  for(const row of weekly){
    const gw=Number(row.gameweek)
    fantasyByGameweek[gw]=(fantasyByGameweek[gw]||0)+Number(row.points||0)
  }

  const currentMatches=matchesRes.data||[]
  const opponentIds=[...new Set(currentMatches.map(m=>Number(m.home_team_id)===id?m.away_team_id:m.home_team_id).filter(Boolean))]
  const {data:opponents}=opponentIds.length?await checked(
    'data:getTeamDetail:opponents',
    supabase.from('scout_teams').select('id,name,slug').in('id',opponentIds),
    {team_id:id}
  ):{data:[]}
  const opponentMap=new Map((opponents||[]).map(o=>[Number(o.id),o]))
  const fixtures=currentMatches.map(m=>{
    const opponentId=Number(m.home_team_id)===id?Number(m.away_team_id):Number(m.home_team_id)
    return {...m,opponent:opponentMap.get(opponentId)||null,venue:Number(m.home_team_id)===id?'HOME':'AWAY'}
  })

  return {
    run,team,season:seasonRes.data||null,tactical:tacticalRes.data||null,history:historyRes.data||[],
    currentMatches:fixtures,currentMatch:fixtures[0]||null,
    opponent:fixtures[0]?.opponent||null,players,fantasyByGameweek,
  }
}

async function _getBacktestOverview() {
  if(offlineBuild())return {currentRun:null,currentRunQa:null,replayWeeks:[],liveWeeks:[],learning:[],replayPlayers:[],livePlayers:[],preseasonCoverage:{teams:0,players:0,activePlayers:0,averagePlayerConfidence:null}}
  const supabase=createPublicClient()
  const [replayWeeksRes,liveWeeksRes,learningRes,preseasonTeamsRes,preseasonPlayersRes,activePlayersRes,currentRunRes]=await Promise.all([
    checked('data:getBacktestOverview:replayWeeks',supabase.from('scout_replay_weeks').select('*').order('gameweek',{ascending:true})),
    checked('data:getBacktestOverview:liveWeeks',supabase.from('scout_backtest_weeks').select('*').order('gameweek',{ascending:true})),
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
      supabase.from('scout_replay_players')
        .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,predicted_p25,predicted_p90,point_error,abs_point_error,band_status,outside_band_distance,main_error_area,data_confidence')
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


async function _getTeamFixturesOverview(){
  if(offlineBuild())return {run:null,teams:[]}
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null,teams:[]}
  const {data:matches}=await checked(
    'data:getTeamFixturesOverview:matches',
    supabase.from('scout_match_predictions')
      .select('home_team_id,away_team_id,home_xg,away_xg,home_win_probability,away_win_probability,home_cs_probability,away_cs_probability')
      .eq('run_id',run.id),
    {run_id:run.id}
  )
  const teamIds=[...new Set((matches||[]).flatMap(m=>[m.home_team_id,m.away_team_id]).filter(Boolean))]
  const {data:teams}=teamIds.length?await checked(
    'data:getTeamFixturesOverview:teams',
    supabase.from('scout_teams').select('id,name').in('id',teamIds)
  ):{data:[]}
  const tm=new Map((teams||[]).map(t=>[Number(t.id),t.name]))
  return {run,teams:(matches||[]).flatMap(m=>[
    {id:m.home_team_id,name:tm.get(Number(m.home_team_id))||'—',opponent:tm.get(Number(m.away_team_id))||'—',venue:'Ev',xg:m.home_xg,oppXg:m.away_xg,win:m.home_win_probability,cs:m.home_cs_probability},
    {id:m.away_team_id,name:tm.get(Number(m.away_team_id))||'—',opponent:tm.get(Number(m.home_team_id))||'—',venue:'Dep',xg:m.away_xg,oppXg:m.home_xg,win:m.away_win_probability,cs:m.away_cs_probability},
  ])}
}

export const getCurrentRun=cache(_getCurrentRun)
export const getPlayersWithProjection=cache(_getPlayersWithProjection)
export const getMatches=cache(_getMatches)
export const getRecommendation=cache(_getRecommendation)
export const getAvailability=cache(_getAvailability)
export const getRoleSignals=cache(_getRoleSignals)
export const getPlayerDetail=cache(_getPlayerDetail)
export const getWeeklyPoints=cache(_getWeeklyPoints)
const getTeamDetailShared=unstable_cache(_getTeamDetail,['team-detail-v3'],{revalidate:300})
const getTeamFixturesOverviewShared=unstable_cache(_getTeamFixturesOverview,['team-fixtures-overview-v2'],{revalidate:300})
export const getTeamDetail=cache(getTeamDetailShared)
export const getBacktestOverview=cache(_getBacktestOverview)
export const getTeamFixturesOverview=cache(getTeamFixturesOverviewShared)
