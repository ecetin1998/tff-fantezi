import { createClient } from '@/lib/supabase/server'

export async function getCurrentRun() {
  const supabase = await createClient()
  const { data } = await supabase.from('scout_model_runs').select('*').eq('is_current', true).order('gameweek', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function getPlayersWithProjection(limit = 700) {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, players: [] }
  const [{ data: players }, { data: projections }, { data: availability }, { data: seasonStats }] = await Promise.all([
    supabase.from('scout_players').select('id,full_name,display_name,shirt_number,team_id,position,price,status,active').eq('active', true).limit(limit),
    supabase.from('scout_player_projections').select('player_id,opponent_name,venue,xi_probability,x_minutes,xfp,p25,p75,p90,six_plus_probability,top25_score,top25_rank,expected_goals,expected_assists,value_score,availability_probability').eq('run_id', run.id).limit(limit),
    supabase.from('scout_availability').select('player_id,availability_type,reason,checked_at,availability_probability,source_reason,injury_date,expected_return,suspension_fixture,detail_source_label,detail_source_url,detail_source_updated_at').eq('run_id', run.id),
    supabase.from('scout_player_season_stats').select('player_id,actual_points').limit(limit),
  ])
  const teamIds = [...new Set((players || []).map(p => p.team_id).filter(Boolean))]
  const { data: teams } = teamIds.length ? await supabase.from('scout_teams').select('id,name,slug').in('id', teamIds) : { data: [] }
  const teamMap = new Map((teams || []).map(t => [t.id, t]))
  const projMap = new Map((projections || []).map(p => [p.player_id, p]))
  const availabilityMap = new Map((availability || []).map(a => [a.player_id, a]))
  const seasonStatsMap = new Map((seasonStats || []).map(s => [Number(s.player_id), s]))
  return {
    run,
    players: (players || []).map(p => ({
      ...p,
      team: teamMap.get(p.team_id)?.name || '—',
      projection: projMap.get(p.id) || null,
      availability: availabilityMap.get(p.id) || null,
      total_points: Number(seasonStatsMap.get(Number(p.id))?.actual_points || 0),
    })).filter(p => p.projection)
  }
}

const ELO_HOME_ADVANTAGE=55
const ELO_K=28

function buildSeasonElo(history=[], teamIds=[]){
  const ratings=new Map(teamIds.map(id=>[Number(id),1500]))
  const finished=[...(history||[])]
    .filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.away_goals!==null&&m.away_goals!==undefined)
    .sort((a,b)=>Number(a.gameweek||0)-Number(b.gameweek||0) || new Date(a.kickoff_at||0)-new Date(b.kickoff_at||0))
  for(const m of finished){
    const homeId=Number(m.home_team_id),awayId=Number(m.away_team_id)
    if(!homeId||!awayId)continue
    const homeRating=ratings.get(homeId)??1500
    const awayRating=ratings.get(awayId)??1500
    const expectedHome=1/(1+10**((awayRating-(homeRating+ELO_HOME_ADVANTAGE))/400))
    const hg=Number(m.home_goals),ag=Number(m.away_goals)
    const actualHome=hg>ag?1:hg===ag?0.5:0
    const margin=Math.abs(hg-ag)
    const marginFactor=margin<=1?1:Math.min(1.6,1+.18*(margin-1))
    const delta=ELO_K*marginFactor*(actualHome-expectedHome)
    ratings.set(homeId,homeRating+delta)
    ratings.set(awayId,awayRating-delta)
  }
  return ratings
}

function eloFixture(homeRating,awayRating){
  const homeExpected=1/(1+10**((awayRating-(homeRating+ELO_HOME_ADVANTAGE))/400))
  return {homeExpected,awayExpected:1-homeExpected}
}

function attackMatchup(xg){
  const n=Number(xg||0)
  return n>=1.65?'good':n<=1.15?'tough':'neutral'
}
function defenseMatchup(csProbability){
  const n=Number(csProbability||0)
  return n>=.40?'good':n<=.25?'tough':'neutral'
}

export async function getMatches() {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, matches: [] }
  const { data: matches } = await supabase.from('scout_match_predictions').select('*').eq('run_id', run.id).order('kickoff_at')
  const teamIds = [...new Set((matches || []).flatMap(m => [m.home_team_id,m.away_team_id]).filter(Boolean))]
  const [{ data: teams },{ data: history },{ data: fantasyRows }]=await Promise.all([
    teamIds.length ? supabase.from('scout_teams').select('id,name,short_name').in('id', teamIds) : Promise.resolve({ data: [] }),
    supabase.from('scout_match_history').select('gameweek,kickoff_at,home_team_id,away_team_id,home_goals,away_goals').order('gameweek',{ascending:true}).order('kickoff_at',{ascending:true}),
    supabase.from('scout_player_projections')
      .select('player_id,xfp,p90,x_minutes,xi_probability,availability_probability,scout_players!inner(team_id,full_name,display_name,position,price,active)')
      .eq('run_id',run.id)
      .limit(700),
  ])
  const tm = new Map((teams || []).map(t => [Number(t.id), t.name]))
  const ratings=buildSeasonElo(history||[],teamIds)
  const eloThroughGameweek=Math.max(0,...(history||[]).filter(m=>m.home_goals!==null&&m.away_goals!==null).map(m=>Number(m.gameweek||0)))

  const fantasyMap=new Map()
  const displayName=p=>p?.display_name || String(p?.full_name||'').trim().split(/\s+/).filter(Boolean).at(-1) || '—'
  for(const row of fantasyRows||[]){
    const p=row.scout_players
    const teamId=Number(p?.team_id)
    if(!teamIds.map(Number).includes(teamId)||!p?.active)continue
    const item={
      player_id:Number(row.player_id),
      name:displayName(p),
      full_name:p.full_name,
      position:p.position,
      price:Number(p.price||0),
      xfp:Number(row.xfp||0),
      p90:Number(row.p90||0),
      x_minutes:Number(row.x_minutes||0),
      xi_probability:Number(row.xi_probability||0),
      availability_probability:Number(row.availability_probability??1),
    }
    if(item.availability_probability<=0)continue
    const list=fantasyMap.get(teamId)||[]
    list.push(item)
    fantasyMap.set(teamId,list)
  }

  const fantasySummary=teamId=>{
    const rows=fantasyMap.get(Number(teamId))||[]
    const eligible=rows.filter(p=>p.x_minutes>=20)
    const attackers=eligible.filter(p=>['MID','FWD'].includes(p.position)).sort((a,b)=>b.xfp-a.xfp||b.p90-a.p90)
    const defenders=eligible.filter(p=>['GK','DEF'].includes(p.position)).sort((a,b)=>b.xfp-a.xfp||b.p90-a.p90)
    const values=eligible.filter(p=>p.price>0&&p.x_minutes>=45).sort((a,b)=>(b.xfp/b.price)-(a.xfp/a.price)||b.xfp-a.xfp)
    return {
      top_attack:attackers[0]||null,
      second_attack:attackers[1]||null,
      top_defense:defenders[0]||null,
      best_value:values[0]||null,
    }
  }

  const enriched=(matches||[]).map(m=>{
    const homeElo=ratings.get(Number(m.home_team_id))??1500
    const awayElo=ratings.get(Number(m.away_team_id))??1500
    const fixture=eloFixture(homeElo,awayElo)
    return {
      ...m,
      home_team:tm.get(Number(m.home_team_id)),
      away_team:tm.get(Number(m.away_team_id)),
      home_elo:Math.round(homeElo),
      away_elo:Math.round(awayElo),
      home_attack_level:attackMatchup(m.home_xg),
      away_attack_level:attackMatchup(m.away_xg),
      home_defense_level:defenseMatchup(m.home_cs_probability),
      away_defense_level:defenseMatchup(m.away_cs_probability),
      home_elo_expectancy:fixture.homeExpected,
      away_elo_expectancy:fixture.awayExpected,
      home_fantasy:fantasySummary(m.home_team_id),
      away_fantasy:fantasySummary(m.away_team_id),
    }
  })
  return {
    run,
    eloThroughGameweek,
    matches:enriched
  }
}

export async function getRecommendation(variant = 'recommended') {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, recommendation: null, members: [] }
  const { data: recommendation } = await supabase.from('scout_squad_recommendations').select('*').eq('run_id',run.id).eq('variant',variant).maybeSingle()
  if (!recommendation) return { run, recommendation:null, members:[] }
  const { data: members } = await supabase.from('scout_squad_members').select('*').eq('recommendation_id',recommendation.id).order('sort_order')
  const ids=(members||[]).map(x=>x.player_id)
  const { data: players } = ids.length ? await supabase.from('scout_players').select('id,full_name,display_name,shirt_number,position,price,team_id').in('id',ids) : {data:[]}
  const teamIds=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const [{ data: teams },{ data: projections }]=await Promise.all([
    teamIds.length ? supabase.from('scout_teams').select('id,name').in('id',teamIds) : Promise.resolve({data:[]}),
    ids.length ? supabase.from('scout_player_projections').select('player_id,p90').eq('run_id',run.id).in('player_id',ids) : Promise.resolve({data:[]}),
  ])
  const pm=new Map((players||[]).map(p=>[p.id,p])), tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  const projMap=new Map((projections||[]).map(p=>[p.player_id,p]))
  return { run, recommendation, members:(members||[]).map(m=>({ ...m, p90:Number(projMap.get(m.player_id)?.p90||0), player:pm.get(m.player_id), team:tm.get(pm.get(m.player_id)?.team_id)||'—' })) }
}

export async function getAvailability() {
  const supabase=await createClient(), run=await getCurrentRun()
  if(!run) return {run:null,rows:[]}
  const {data:rows}=await supabase.from('scout_availability').select('*').eq('run_id',run.id).order('availability_probability',{ascending:true})
  const ids=[...new Set((rows||[]).map(x=>x.player_id))]
  const {data:players}=ids.length?await supabase.from('scout_players').select('id,full_name,display_name,shirt_number,position,team_id,price,active').in('id',ids).eq('active',true):{data:[]}
  const tids=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const {data:teams}=tids.length?await supabase.from('scout_teams').select('id,name').in('id',tids):{data:[]}
  const pm=new Map((players||[]).map(p=>[p.id,p])),tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  return {run,rows:(rows||[]).map(r=>({...r,player:pm.get(r.player_id),team:tm.get(pm.get(r.player_id)?.team_id)||'—'})).filter(r=>r.player)}
}

export async function getRoleSignals() {
  const supabase=await createClient(), run=await getCurrentRun()
  if(!run) return {run:null,rows:[]}
  const {data:rows}=await supabase.from('scout_role_signals').select('*').eq('run_id',run.id)
  const ids=[...new Set((rows||[]).map(x=>x.player_id))]
  const {data:players}=ids.length?await supabase.from('scout_players').select('id,full_name,display_name,shirt_number,position,team_id,price,active').in('id',ids).eq('active',true):{data:[]}
  const tids=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const {data:teams}=tids.length?await supabase.from('scout_teams').select('id,name').in('id',tids):{data:[]}
  const pm=new Map((players||[]).map(p=>[p.id,p])),tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  return {run,rows:(rows||[]).map(r=>({...r,player:pm.get(r.player_id),team:tm.get(pm.get(r.player_id)?.team_id)||'—'})).filter(r=>r.player)}
}

export async function getAuthState() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub || null
  if (!userId) return { userId:null, email:null, plan:'free' }
  const { data: sub } = await supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',userId).maybeSingle()
  const activePro = sub?.plan === 'pro' && ['active','trialing'].includes(sub?.status) && (!sub.valid_until || new Date(sub.valid_until) > new Date())
  return { userId, email:claimsData.claims.email || null, plan:activePro ? 'pro' : 'free' }
}


export async function getPlayerDetail(playerId) {
  const supabase = await createClient()
  const run = await getCurrentRun()
  const id = Number(playerId)
  if (!Number.isFinite(id)) return null

  const { data: player } = await supabase
    .from('scout_players')
    .select('id,full_name,display_name,shirt_number,team_id,position,price,status,active')
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
    run ? supabase.from('scout_availability').select('*').eq('run_id', run.id).eq('player_id', id).maybeSingle() : Promise.resolve({ data:null }),
    run ? supabase.from('scout_role_signals').select('*').eq('run_id', run.id).eq('player_id', id).maybeSingle() : Promise.resolve({ data:null }),
    supabase.from('scout_player_season_stats').select('*').eq('player_id', id).maybeSingle(),
    supabase.from('scout_player_weekly_points').select('*').eq('player_id', id).eq('is_final', true).order('gameweek', { ascending:true }).limit(38),
  ])

  let match = null
  if (run && player.team_id) {
    const { data } = await supabase
      .from('scout_match_predictions')
      .select('*')
      .eq('run_id', run.id)
      .or('home_team_id.eq.' + player.team_id + ',away_team_id.eq.' + player.team_id)
      .limit(1)
      .maybeSingle()
    match = data || null
  }

  return {
    run,
    player: { ...player, team: team?.name || '—' },
    projection: projection || null,
    availability: availability || null,
    role: role || null,
    season: season || null,
    weekly: weekly || [],
    match,
  }
}

export async function getWeeklyPoints() {
  const supabase = await createClient()
  const run = await getCurrentRun()

  const [{ data: players }, { data: teams }, { data: stats }] = await Promise.all([
    supabase.from('scout_players').select('id,full_name,display_name,shirt_number,team_id,position,price,active').eq('active', true).limit(700),
    supabase.from('scout_teams').select('id,name').limit(30),
    supabase.from('scout_player_season_stats').select('*').limit(700),
  ])

  // PostgREST/Supabase projects commonly cap a single response around 1,000 rows.
  // Weekly history is larger than that, so fetch deterministic 1,000-row pages.
  const points = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('scout_player_weekly_points')
      .select('player_id,player_name,team_name,position,gameweek,points,minutes,is_final')
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
    list.push(row)
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


export async function getTeamDetail(teamId) {
  const supabase = await createClient()
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
    { data: currentMatch },
    { data: weekly },
  ] = await Promise.all([
    supabase.from('scout_players')
      .select('id,full_name,display_name,shirt_number,team_id,position,price,status,active')
      .eq('team_id', id).eq('active', true).order('position').order('price', { ascending:false }),
    supabase.from('scout_team_season_stats').select('*').eq('team_id', id).maybeSingle(),
    supabase.from('scout_match_history').select('*')
      .or('home_team_id.eq.'+id+',away_team_id.eq.'+id)
      .order('gameweek', { ascending:false }).limit(38),
    run ? supabase.from('scout_match_predictions').select('*')
      .eq('run_id', run.id)
      .or('home_team_id.eq.'+id+',away_team_id.eq.'+id)
      .limit(1).maybeSingle() : Promise.resolve({ data:null }),
    supabase.from('scout_player_weekly_points')
      .select('player_id,gameweek,points,minutes,team_name')
      .eq('team_name', team.name).eq('is_final', true)
      .order('gameweek', { ascending:true }).limit(1000),
  ])

  const playerIds=(roster||[]).map(p=>p.id)
  const [{ data: projections }, { data: availability }] = await Promise.all([
    run && playerIds.length
      ? supabase.from('scout_player_projections').select('*').eq('run_id',run.id).in('player_id',playerIds)
      : Promise.resolve({data:[]}),
    run && playerIds.length
      ? supabase.from('scout_availability').select('*').eq('run_id',run.id).in('player_id',playerIds)
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

  let opponent=null
  if(currentMatch){
    const opponentId=Number(currentMatch.home_team_id)===id ? currentMatch.away_team_id : currentMatch.home_team_id
    const {data:o}=await supabase.from('scout_teams').select('id,name,slug').eq('id',opponentId).maybeSingle()
    opponent=o||null
  }

  return {
    run, team, season:season||null, history:history||[], currentMatch:currentMatch||null,
    opponent, players, fantasyByGameweek,
  }
}


export async function getBacktestOverview() {
  const supabase = await createClient()
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
    supabase.from('scout_learning_log').select('*').order('after_gameweek', { ascending:false }).order('detected_at', { ascending:false }).limit(30),
    supabase.from('scout_preseason_team_priors').select('team_id').eq('season','2026-27').eq('prior_version','cold-start-v1'),
    supabase.from('scout_preseason_player_priors').select('player_id,prior_confidence').eq('season','2026-27').eq('prior_version','cold-start-v1'),
    supabase.from('scout_players').select('id').eq('active',true),
    supabase.from('scout_model_runs').select('id,gameweek,model_version,generated_at,simulation_count,status,is_current').eq('is_current',true).maybeSingle(),
  ])

  let currentRunQa=null
  if(currentRun?.id){
    const [{data:modelQa},{data:dataQa}]=await Promise.all([
      supabase.rpc('scout_run_qa',{p_run_id:currentRun.id}),
      supabase.rpc('scout_data_integrity_qa',{p_run_id:currentRun.id}),
    ])
    currentRunQa={
      ...(modelQa||{}),
      data_integrity:dataQa||null,
      pass:Boolean(modelQa?.pass)&&Boolean(dataQa?.pass),
    }
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
