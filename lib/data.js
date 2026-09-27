import {cache} from 'react'
import {createClient as createServerClient} from '@/lib/supabase/server'
import {createPublicClient} from '@/lib/supabase/public'
import {CURRENT_SEASON} from '@/lib/rules'
import {reportServerError} from '@/lib/observability'

const offlineBuild=()=>process.env.SCOUT_OFFLINE_BUILD==='1'

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
      price:Number(row.price||0),active:Boolean(row.active),total_points:Number(row.total_points||0),
      projection:{
        opponent_name:row.opponent_name,venue:row.venue,xi_probability:row.xi_probability,
        appearance_probability:row.appearance_probability,over60_probability:row.over60_probability,
        x_minutes:row.x_minutes,core_xfp:row.core_xfp,x_bonus:row.x_bonus,xfp:row.xfp,
        p25:row.p25,p75:row.p75,p90:row.p90,six_plus_probability:row.six_plus_probability,
        value_score:row.value_score,expected_goals:row.expected_goals,expected_assists:row.expected_assists,
        availability_probability:row.projection_availability_probability,
        top25_score:unavailable?null:row.top25_score,
        top25_rank:unavailable?null:row.top25_rank,
        confidence:row.confidence
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
    .select('*').eq('run_id',run.id).order('kickoff_at')
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
  const supabase = createPublicClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, recommendation: null, members: [] }
  const { data: recommendation } = await supabase.from('scout_squad_recommendations').select('*').eq('run_id',run.id).eq('variant',variant).maybeSingle()
  if (!recommendation) return { run, recommendation:null, members:[] }
  const { data: members } = await supabase.from('scout_squad_members').select('*').eq('recommendation_id',recommendation.id).order('sort_order')
  const ids=(members||[]).map(x=>x.player_id)
  const { data: players } = ids.length ? await supabase.from('scout_players').select('id,full_name,display_name,short_label,shirt_number,position,price,team_id').in('id',ids) : {data:[]}
  const teamIds=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const [{ data: teams },{ data: projections }]=await Promise.all([
    teamIds.length ? supabase.from('scout_teams').select('id,name').in('id',teamIds) : Promise.resolve({data:[]}),
    ids.length ? supabase.from('scout_player_projections').select('player_id,p90').eq('run_id',run.id).in('player_id',ids) : Promise.resolve({data:[]}),
  ])
  const pm=new Map((players||[]).map(p=>[p.id,p])), tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  const projMap=new Map((projections||[]).map(p=>[p.player_id,p]))
  return { run, recommendation, members:(members||[]).map(m=>({ ...m, p90:Number(projMap.get(m.player_id)?.p90||0), player:pm.get(m.player_id), team:tm.get(pm.get(m.player_id)?.team_id)||'—' })) }
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
      shirt_number:row.shirt_number,position:row.position,team_id:row.team_id,price:row.price,active:row.active},
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
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub || null
  if (!userId) return { userId:null, email:null, plan:'free' }
  const { data: sub } = await supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',userId).maybeSingle()
  const activePro = sub?.plan === 'pro' && ['active','trialing'].includes(sub?.status) && (!sub.valid_until || new Date(sub.valid_until) > new Date())
  return { userId, email:claimsData.claims.email || null, plan:activePro ? 'pro' : 'free' }
}


async function _getPlayerDetail(playerId) {
  if(offlineBuild()) return null
  const supabase = createPublicClient()
  const run = await getCurrentRun()
  const id = Number(playerId)
  if (!Number.isFinite(id)) return null

  const { data: player } = await supabase
    .from('scout_players')
    .select('id,full_name,display_name,short_label,shirt_number,team_id,position,price,active')
    .eq('id', id)
    .maybeSingle()

  if (!player) return null

  const [
    { data: team },
    { data: projection },
    { data: availability },
    { data: role },
    { data: season },
    { data: weekly }
  ] = await Promise.all([
    supabase.from('scout_teams').select('id,name,slug').eq('id', player.team_id).maybeSingle(),
    run ? supabase.from('scout_player_projections').select('*').eq('run_id', run.id).eq('player_id', id).maybeSingle() : Promise.resolve({ data:null }),
    run ? supabase.from('scout_availability').select('run_id,player_id,availability_type,availability_probability,canonical_reason,checked_at,suspension_end,injury_date,expected_return_date,suspension_fixture').eq('run_id', run.id).eq('player_id', id).maybeSingle() : Promise.resolve({ data:null }),
    run ? supabase.from('scout_role_signals').select('*').eq('run_id', run.id).eq('player_id', id).maybeSingle() : Promise.resolve({ data:null }),
    supabase.from('scout_player_season_stats').select('*').eq('season',CURRENT_SEASON).eq('player_id', id).maybeSingle(),
    supabase.from('scout_player_weekly_points').select('*').eq('player_id', id).eq('is_final', true).order('gameweek', { ascending:true }).limit(38),
  ])

  let matches = []
  if (run && player.team_id) {
    const { data, error } = await supabase
      .from('scout_match_predictions')
      .select('*')
      .eq('run_id', run.id)
      .or('home_team_id.eq.' + player.team_id + ',away_team_id.eq.' + player.team_id)
      .order('kickoff_at', { ascending:true })
    if(error){reportServerError('data:getPlayerDetail:fixtures',error,{playerId:id});throw error}
    const rawMatches=data||[]
    const opponentIds=[...new Set(rawMatches.map(m=>Number(m.home_team_id)===Number(player.team_id)?Number(m.away_team_id):Number(m.home_team_id)).filter(Boolean))]
    let teamNames=new Map()
    if(opponentIds.length){
      const {data:opponents,error:opponentError}=await supabase.from('scout_teams').select('id,name,slug').in('id',opponentIds)
      if(opponentError){reportServerError('data:getPlayerDetail:opponents',opponentError,{playerId:id});throw opponentError}
      teamNames=new Map((opponents||[]).map(o=>[Number(o.id),o]))
    }
    matches=rawMatches.map(m=>({
      ...m,
      home_team_name:Number(m.home_team_id)===Number(player.team_id)?team?.name:(teamNames.get(Number(m.home_team_id))?.name||'—'),
      away_team_name:Number(m.away_team_id)===Number(player.team_id)?team?.name:(teamNames.get(Number(m.away_team_id))?.name||'—'),
    }))
  }

  return {
    run,
    player: { ...player, team: team?.name || '—' },
    projection: projection || null,
    availability: availability || null,
    role: role || null,
    season: season || null,
    weekly: weekly || [],
    matches,
    match:matches[0]||null,
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

    if (error) throw error
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
  if(offlineBuild()) return null
  const supabase = createPublicClient()
  const run = await getCurrentRun()
  const id = Number(teamId)
  if (!Number.isFinite(id)) return null

  const { data: team } = await supabase
    .from('scout_teams')
    .select('id,name,short_name,slug,active')
    .eq('id', id)
    .maybeSingle()
  if (!team) return null

  const [
    { data: roster },
    { data: season },
    { data: history },
    { data: currentMatchesRaw, error:currentMatchesError },
  ] = await Promise.all([
    supabase.from('scout_players')
      .select('id,full_name,display_name,short_label,shirt_number,team_id,position,price,active')
      .eq('team_id', id).eq('active', true).order('position').order('price', { ascending:false }),
    supabase.from('scout_team_season_stats').select('*').eq('team_id', id).maybeSingle(),
    supabase.from('scout_match_history').select('*')
      .eq('season',CURRENT_SEASON)
      .or('home_team_id.eq.'+id+',away_team_id.eq.'+id)
      .order('gameweek', { ascending:false }).limit(38),
    run ? supabase.from('scout_match_predictions').select('*')
      .eq('run_id', run.id)
      .or('home_team_id.eq.'+id+',away_team_id.eq.'+id)
      .order('kickoff_at',{ascending:true}) : Promise.resolve({ data:[],error:null }),
  ])
  if(currentMatchesError){reportServerError('data:getTeamDetail:fixtures',currentMatchesError,{teamId:id});throw currentMatchesError}

  const playerIds=(roster||[]).map(p=>p.id)
  const weekly=[]
  if(playerIds.length){
    const pageSize=1000
    for(let from=0;;from+=pageSize){
      const {data:page,error}=await supabase.from('scout_player_weekly_points')
        .select('player_id,gameweek,points,minutes')
        .in('player_id',playerIds)
        .eq('is_final',true)
        .order('gameweek',{ascending:true})
        .order('player_id',{ascending:true})
        .range(from,from+pageSize-1)
      if(error)throw error
      weekly.push(...(page||[]))
      if(!page||page.length<pageSize)break
    }
  }
  const [{ data: projections }, { data: availability }] = await Promise.all([
    run && playerIds.length
      ? supabase.from('scout_player_projections').select('*').eq('run_id',run.id).in('player_id',playerIds)
      : Promise.resolve({data:[]}),
    run && playerIds.length
      ? supabase.from('scout_availability').select('run_id,player_id,availability_type,availability_probability,canonical_reason,checked_at,suspension_end,injury_date,expected_return_date,suspension_fixture').eq('run_id',run.id).in('player_id',playerIds)
      : Promise.resolve({data:[]}),
  ])

  const pm=new Map((projections||[]).map(x=>[x.player_id,x]))
  const am=new Map((availability||[]).map(x=>[x.player_id,x]))
  const players=(roster||[]).map(p=>({...p,projection:pm.get(p.id)||null,availability:am.get(p.id)||null}))
    .sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))

  const fantasyByGameweek={}
  for(const row of weekly||[]){
    const gw=Number(row.gameweek)
    fantasyByGameweek[gw]=(fantasyByGameweek[gw]||0)+Number(row.points||0)
  }

  const rawCurrentMatches=currentMatchesRaw||[]
  const opponentIds=[...new Set(rawCurrentMatches.map(m=>Number(m.home_team_id)===id?Number(m.away_team_id):Number(m.home_team_id)).filter(Boolean))]
  let opponents=[]
  if(opponentIds.length){
    const {data:o,error:oError}=await supabase.from('scout_teams').select('id,name,slug').in('id',opponentIds)
    if(oError){reportServerError('data:getTeamDetail:opponents',oError,{teamId:id});throw oError}
    opponents=o||[]
  }
  const opponentMap=new Map(opponents.map(o=>[Number(o.id),o]))
  const currentMatches=rawCurrentMatches.map(m=>({
    ...m,
    home_team_name:Number(m.home_team_id)===id?team.name:(opponentMap.get(Number(m.home_team_id))?.name||'—'),
    away_team_name:Number(m.away_team_id)===id?team.name:(opponentMap.get(Number(m.away_team_id))?.name||'—'),
  }))
  const currentMatch=currentMatches[0]||null
  const opponent=currentMatch
    ? opponentMap.get(Number(currentMatch.home_team_id)===id?Number(currentMatch.away_team_id):Number(currentMatch.home_team_id))||null
    : null

  return {
    run, team, season:season||null, history:history||[], currentMatches,currentMatch,
    opponents,opponent,players,fantasyByGameweek,
  }
}


async function _getBacktestOverview() {
  if(offlineBuild()) return {currentRun:null,currentRunQa:null,replayWeeks:[],liveWeeks:[],learning:[],replayPlayers:[],livePlayers:[],preseasonCoverage:{teams:0,players:0,activePlayers:0,averagePlayerConfidence:null}}
  const supabase = createPublicClient()
  const [
    { data: replayWeeks },
    { data: liveWeeks },
    { data: learning },
    { data: preseasonTeams },
    { data: preseasonPlayers },
    { data: activePlayers },
    { data: currentRun },
  ] = await Promise.all([
    supabase.from('scout_replay_weeks').select('*').order('gameweek', { ascending:true }),
    supabase.from('scout_backtest_weeks').select('*').order('gameweek', { ascending:true }),
    supabase.from('scout_learning_log').select('id,after_gameweek,detected_at,component,segment,sample_size,signal,proposed_adjustment,applied_adjustment,status,summary_tr').order('after_gameweek', { ascending:false }).order('detected_at', { ascending:false }).limit(30),
    supabase.from('scout_preseason_team_priors').select('team_id').eq('season',CURRENT_SEASON).eq('prior_version','cold-start-v1'),
    supabase.from('scout_preseason_player_priors').select('player_id,prior_confidence').eq('season',CURRENT_SEASON).eq('prior_version','cold-start-v1'),
    supabase.from('scout_players').select('id').eq('active',true),
    supabase.from('scout_model_runs').select('id,gameweek,model_version,generated_at,simulation_count,status,is_current').eq('is_current',true).maybeSingle(),
  ])

  let currentRunQa=null
  if(currentRun?.id){
    const {data:qaResult,error:qaError}=await supabase.from('scout_run_qa_results')
      .select('model_qa,data_integrity_qa,pass,recorded_at').eq('run_id',currentRun.id).maybeSingle()
    if(qaError){reportServerError('data:getBacktestOverview:qaResult',qaError);throw qaError}
    currentRunQa=qaResult?{...(qaResult.model_qa||{}),data_integrity:qaResult.data_integrity_qa||null,pass:Boolean(qaResult.pass),recorded_at:qaResult.recorded_at}:null
  }

  const latestReplayClosed=[...(replayWeeks||[])].reverse().find(w=>w.status==='closed')
  const latestLiveClosed=[...(liveWeeks||[])].reverse().find(w=>w.status==='closed')
  let replayPlayers=[]
  let livePlayers=[]

  if(latestReplayClosed){
    const {data}=await supabase.from('scout_replay_players')
      .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,predicted_p25,predicted_p90,point_error,abs_point_error,band_status,outside_band_distance,main_error_area,data_confidence')
      .eq('gameweek',latestReplayClosed.gameweek)
      .not('actual_points','is',null)
      .order('abs_point_error',{ascending:false})
      .limit(20)
    replayPlayers=data||[]
  }

  if(latestLiveClosed){
    const {data}=await supabase.from('scout_backtest_players')
      .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,p25,p90,prediction_error,abs_error,band_status,outside_band_distance,error_component,data_confidence')
      .eq('gameweek',latestLiveClosed.gameweek)
      .not('actual_points','is',null)
      .order('abs_error',{ascending:false})
      .limit(20)
    livePlayers=data||[]
  }

  return {
    currentRun:currentRun||null,
    currentRunQa,
    replayWeeks:replayWeeks||[],
    liveWeeks:liveWeeks||[],
    learning:learning||[],
    replayPlayers,
    livePlayers,
    preseasonCoverage:{
      teams:(preseasonTeams||[]).length,
      players:(preseasonPlayers||[]).length,
      activePlayers:(activePlayers||[]).length,
      averagePlayerConfidence:(preseasonPlayers||[]).length
        ? (preseasonPlayers||[]).reduce((s,p)=>s+Number(p.prior_confidence||0),0)/(preseasonPlayers||[]).length
        : null,
    },
  }
}


async function _getTeamFixturesOverview(){
  const supabase=createPublicClient()
  const run=await getCurrentRun()
  if(!run)return {run:null,teams:[]}
  const {data:matches}=await supabase.from('scout_match_predictions')
    .select('home_team_id,away_team_id,home_xg,away_xg,home_win_probability,away_win_probability,home_cs_probability,away_cs_probability')
    .eq('run_id',run.id)
  const teamIds=[...new Set((matches||[]).flatMap(m=>[m.home_team_id,m.away_team_id]).filter(Boolean))]
  const {data:teams}=teamIds.length?await supabase.from('scout_teams').select('id,name').in('id',teamIds):{data:[]}
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
export const getTeamDetail=cache(_getTeamDetail)
export const getBacktestOverview=cache(_getBacktestOverview)
export const getTeamFixturesOverview=cache(_getTeamFixturesOverview)
