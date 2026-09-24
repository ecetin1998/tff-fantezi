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
  const [{ data: players }, { data: projections }, { data: availability }] = await Promise.all([
    supabase.from('scout_players').select('id,full_name,display_name,shirt_number,team_id,position,price,status,active').eq('active', true).limit(limit),
    supabase.from('scout_player_projections').select('*').eq('run_id', run.id).limit(limit),
    supabase.from('scout_availability').select('player_id,availability_type,reason,checked_at,availability_probability').eq('run_id', run.id),
  ])
  const teamIds = [...new Set((players || []).map(p => p.team_id).filter(Boolean))]
  const { data: teams } = teamIds.length ? await supabase.from('scout_teams').select('id,name,slug').in('id', teamIds) : { data: [] }
  const teamMap = new Map((teams || []).map(t => [t.id, t]))
  const projMap = new Map((projections || []).map(p => [p.player_id, p]))
  const availabilityMap = new Map((availability || []).map(a => [a.player_id, a]))
  return { run, players: (players || []).map(p => ({ ...p, team: teamMap.get(p.team_id)?.name || '—', projection: projMap.get(p.id) || null, availability: availabilityMap.get(p.id) || null })).filter(p => p.projection) }
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

const FIXTURE_HOME_ADJUSTMENT=15
const FIXTURE_EASY_OPPONENT_ELO=1470
const FIXTURE_HARD_OPPONENT_ELO=1530

function fixtureDifficulty(opponentElo,{atHome=false}={}){
  const effectiveOpponent=Number(opponentElo||1500)+(atHome?-FIXTURE_HOME_ADJUSTMENT:FIXTURE_HOME_ADJUSTMENT)
  const level=effectiveOpponent<=FIXTURE_EASY_OPPONENT_ELO
    ? 'easy'
    : effectiveOpponent>=FIXTURE_HARD_OPPONENT_ELO
      ? 'hard'
      : 'medium'
  return {level,effectiveOpponent:Math.round(effectiveOpponent)}
}

export async function getMatches() {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, matches: [] }
  const { data: matches } = await supabase.from('scout_match_predictions').select('*').eq('run_id', run.id).order('kickoff_at')
  const teamIds = [...new Set((matches || []).flatMap(m => [m.home_team_id,m.away_team_id]).filter(Boolean))]
  const [{ data: teams },{ data: history }]=await Promise.all([
    teamIds.length ? supabase.from('scout_teams').select('id,name,short_name').in('id', teamIds) : Promise.resolve({ data: [] }),
    supabase.from('scout_match_history').select('gameweek,kickoff_at,home_team_id,away_team_id,home_goals,away_goals').order('gameweek',{ascending:true}).order('kickoff_at',{ascending:true}),
  ])
  const tm = new Map((teams || []).map(t => [Number(t.id), t.name]))
  const ratings=buildSeasonElo(history||[],teamIds)
  const eloThroughGameweek=Math.max(0,...(history||[]).filter(m=>m.home_goals!==null&&m.away_goals!==null).map(m=>Number(m.gameweek||0)))
  const enriched=(matches||[]).map(m=>{
    const homeElo=ratings.get(Number(m.home_team_id))??1500
    const awayElo=ratings.get(Number(m.away_team_id))??1500
    const fixture=eloFixture(homeElo,awayElo)
    const homeDifficulty=fixtureDifficulty(awayElo,{atHome:true})
    const awayDifficulty=fixtureDifficulty(homeElo,{atHome:false})
    return {
      ...m,
      home_team:tm.get(Number(m.home_team_id)),
      away_team:tm.get(Number(m.away_team_id)),
      home_elo:Math.round(homeElo),
      away_elo:Math.round(awayElo),
      home_fixture_level:homeDifficulty.level,
      away_fixture_level:awayDifficulty.level,
      home_fixture_opponent_elo:homeDifficulty.effectiveOpponent,
      away_fixture_opponent_elo:awayDifficulty.effectiveOpponent,
      home_elo_expectancy:fixture.homeExpected,
      away_elo_expectancy:fixture.awayExpected,
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
  const { data: teams } = teamIds.length ? await supabase.from('scout_teams').select('id,name').in('id',teamIds) : {data:[]}
  const pm=new Map((players||[]).map(p=>[p.id,p])), tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  return { run, recommendation, members:(members||[]).map(m=>({ ...m, player:pm.get(m.player_id), team:tm.get(pm.get(m.player_id)?.team_id)||'—' })) }
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
  const [{ data: replayWeeks }, { data: liveWeeks }, { data: learning }] = await Promise.all([
    supabase.from('scout_replay_weeks').select('*').order('gameweek', { ascending:true }),
    supabase.from('scout_backtest_weeks').select('*').order('gameweek', { ascending:true }),
    supabase.from('scout_learning_log').select('*').order('after_gameweek', { ascending:false }).order('detected_at', { ascending:false }).limit(30),
  ])

  const latestReplayClosed=[...(replayWeeks||[])].reverse().find(w=>w.status==='closed')
  const latestLiveClosed=[...(liveWeeks||[])].reverse().find(w=>w.status==='closed')
  let replayPlayers=[]
  let livePlayers=[]

  if(latestReplayClosed){
    const {data}=await supabase.from('scout_replay_players')
      .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,point_error,abs_point_error,main_error_area,data_confidence')
      .eq('gameweek',latestReplayClosed.gameweek)
      .not('actual_points','is',null)
      .order('abs_point_error',{ascending:false})
      .limit(20)
    replayPlayers=data||[]
  }

  if(latestLiveClosed){
    const {data}=await supabase.from('scout_backtest_players')
      .select('gameweek,player_id,player_name,predicted_xfp,actual_points,predicted_minutes,actual_minutes,prediction_error,abs_error,error_component,data_confidence')
      .eq('gameweek',latestLiveClosed.gameweek)
      .not('actual_points','is',null)
      .order('abs_error',{ascending:false})
      .limit(20)
    livePlayers=data||[]
  }

  return {
    replayWeeks:replayWeeks||[],
    liveWeeks:liveWeeks||[],
    learning:learning||[],
    replayPlayers,
    livePlayers,
  }
}
