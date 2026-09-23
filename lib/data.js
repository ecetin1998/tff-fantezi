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
  const [{ data: players }, { data: projections }] = await Promise.all([
    supabase.from('scout_players').select('id,full_name,team_id,position,price,status,active').eq('active', true).limit(limit),
    supabase.from('scout_player_projections').select('*').eq('run_id', run.id).limit(limit),
  ])
  const teamIds = [...new Set((players || []).map(p => p.team_id).filter(Boolean))]
  const { data: teams } = teamIds.length ? await supabase.from('scout_teams').select('id,name,slug').in('id', teamIds) : { data: [] }
  const teamMap = new Map((teams || []).map(t => [t.id, t]))
  const projMap = new Map((projections || []).map(p => [p.player_id, p]))
  return { run, players: (players || []).map(p => ({ ...p, team: teamMap.get(p.team_id)?.name || '—', projection: projMap.get(p.id) || null })).filter(p => p.projection) }
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
