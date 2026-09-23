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
    supabase.from('scout_players').select('id,full_name,team_id,position,price,status,active').eq('active', true).limit(limit),
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

export async function getMatches() {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, matches: [] }
  const { data: matches } = await supabase.from('scout_match_predictions').select('*').eq('run_id', run.id).order('kickoff_at')
  const teamIds = [...new Set((matches || []).flatMap(m => [m.home_team_id,m.away_team_id]).filter(Boolean))]
  const { data: teams } = teamIds.length ? await supabase.from('scout_teams').select('id,name,short_name').in('id', teamIds) : { data: [] }
  const tm = new Map((teams || []).map(t => [t.id, t.name]))
  return { run, matches: (matches || []).map(m => ({ ...m, home_team: tm.get(m.home_team_id), away_team: tm.get(m.away_team_id) })) }
}

export async function getRecommendation(variant = 'recommended') {
  const supabase = await createClient()
  const run = await getCurrentRun()
  if (!run) return { run: null, recommendation: null, members: [] }
  const { data: recommendation } = await supabase.from('scout_squad_recommendations').select('*').eq('run_id',run.id).eq('variant',variant).maybeSingle()
  if (!recommendation) return { run, recommendation:null, members:[] }
  const { data: members } = await supabase.from('scout_squad_members').select('*').eq('recommendation_id',recommendation.id).order('sort_order')
  const ids=(members||[]).map(x=>x.player_id)
  const { data: players } = ids.length ? await supabase.from('scout_players').select('id,full_name,position,price,team_id').in('id',ids) : {data:[]}
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
  const {data:players}=ids.length?await supabase.from('scout_players').select('id,full_name,position,team_id,price').in('id',ids):{data:[]}
  const tids=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const {data:teams}=tids.length?await supabase.from('scout_teams').select('id,name').in('id',tids):{data:[]}
  const pm=new Map((players||[]).map(p=>[p.id,p])),tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  return {run,rows:(rows||[]).map(r=>({...r,player:pm.get(r.player_id),team:tm.get(pm.get(r.player_id)?.team_id)||'—'}))}
}

export async function getRoleSignals() {
  const supabase=await createClient(), run=await getCurrentRun()
  if(!run) return {run:null,rows:[]}
  const {data:rows}=await supabase.from('scout_role_signals').select('*').eq('run_id',run.id)
  const ids=[...new Set((rows||[]).map(x=>x.player_id))]
  const {data:players}=ids.length?await supabase.from('scout_players').select('id,full_name,position,team_id,price').in('id',ids):{data:[]}
  const tids=[...new Set((players||[]).map(p=>p.team_id).filter(Boolean))]
  const {data:teams}=tids.length?await supabase.from('scout_teams').select('id,name').in('id',tids):{data:[]}
  const pm=new Map((players||[]).map(p=>[p.id,p])),tm=new Map((teams||[]).map(t=>[t.id,t.name]))
  return {run,rows:(rows||[]).map(r=>({...r,player:pm.get(r.player_id),team:tm.get(pm.get(r.player_id)?.team_id)||'—'}))}
}

export async function getModelOverview(){
  const supabase=await createClient(),run=await getCurrentRun()
  if(!run)return {run:null,confidence:{},counts:{}}
  const [{data:projs,count:projectionCount},{count:availabilityCount},{count:roleCount},{count:matchCount}]=await Promise.all([
    supabase.from('scout_player_projections').select('data_confidence',{count:'exact'}).eq('run_id',run.id),
    supabase.from('scout_availability').select('*',{count:'exact',head:true}).eq('run_id',run.id),
    supabase.from('scout_role_signals').select('*',{count:'exact',head:true}).eq('run_id',run.id),
    supabase.from('scout_match_predictions').select('*',{count:'exact',head:true}).eq('run_id',run.id),
  ])
  const confidence=(projs||[]).reduce((a,x)=>(a[x.data_confidence||'—']=(a[x.data_confidence||'—']||0)+1,a),{})
  return {run,confidence,counts:{projectionCount,availabilityCount,roleCount,matchCount}}
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
    .select('id,full_name,team_id,position,price,status,active')
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
  const [{ data: players }, { data: teams }, { data: points }, { data: stats }] = await Promise.all([
    supabase.from('scout_players').select('id,full_name,team_id,position,price,active').eq('active', true).limit(700),
    supabase.from('scout_teams').select('id,name').limit(30),
    supabase.from('scout_player_weekly_points').select('player_id,player_name,team_name,position,gameweek,points,minutes,is_final').eq('is_final', true).order('gameweek').limit(5000),
    supabase.from('scout_player_season_stats').select('*').limit(700),
  ])

  const teamMap = new Map((teams || []).map(t => [t.id, t.name]))
  const statMap = new Map((stats || []).map(s => [s.player_id, s]))
  const historyMap = new Map()

  for (const row of points || []) {
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
