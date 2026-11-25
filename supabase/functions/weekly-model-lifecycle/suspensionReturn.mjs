/**
 * Returning from a verified, COMPLETED TFF match ban is not the same as
 * being relegated to the bench. Preserve independently confirmed pre-ban
 * starter history without inventing future starters or post-hoc xFP.
 *
 * Returns a CONDITIONAL team XI selection weight; 11-starter quota,
 * other teammates, availability and the 50K Monte Carlo remain authoritative.
 */
const bounded=x=>Math.max(.01,Math.min(.995,x))
const timestamp=x=>{const t=Date.parse(x||"");return Number.isFinite(t)?t:null}
const unchanged=(role,reason)=>({role,applied:false,delta:0,reason,evidence_weeks:[]})

export function restoreVerifiedSuspensionReturn({
  baseline,targetWeek,availability=1,seasonStarts,matchesPlayed,
  cases=[],weekly=[],tactical=[],teamId,cutoffAt,
  alreadyApplied=false
}={}){
  const role=Number(baseline)
  if(!Number.isFinite(role)||role<=0||role>=1)return unchanged(role,"invalid_baseline")
  if(alreadyApplied)return unchanged(role,"already_applied_in_stable_input")
  if(!(Number(availability)>=.95))return unchanged(role,"not_fully_available")
  const target=Number(targetWeek),cutoff=timestamp(cutoffAt)
  if(!Number.isInteger(target)||target<3||cutoff===null)return unchanged(role,"invalid_target_or_cutoff")
  const starts=Number(seasonStarts),played=Number(matchesPlayed)
  if(!Number.isInteger(starts)||!Number.isInteger(played)||played<6||
     starts<5||starts>played||starts/played<.72)return unchanged(role,"not_historically_regular_starter")
  const eligible=(cases||[]).filter(c=>{
    const affected=c?.affected_gameweeks
    if(!Array.isArray(affected)||affected.length===0)return false
    const weeks=affected.map(Number).sort((a,b)=>a-b)
    return Number(c.team_id)===Number(teamId)&&
      weeks.every(Number.isInteger)&&
      weeks.at(-1)===target-1&&weeks.every((w,i)=>i===0||w===weeks[i-1]+1)&&
      Number(c.offense_gameweek)<weeks[0]
  }).sort((a,b)=>Number(b.offense_gameweek)-Number(a.offense_gameweek))
  if(!eligible.length)return unchanged(role,"no_verified_ban_ending_last_week")
  const selected=eligible[0]
  const banWeeks=selected.affected_gameweeks.map(Number).sort((a,b)=>a-b)
  // Require the actual fantasy record to show a missed fixture on EVERY
  // officially banned week; no trust in legacy/unverified zeros alone.
  const banMisses=banWeeks.every(week=>(weekly||[]).some(row=>
    Number(row.gameweek)===week && row.is_final===true &&
    Number(row.minutes)===0 && row.minutes!=null &&
    timestamp(row.source_updated_at)!==null &&
    timestamp(row.source_updated_at)<cutoff))
  if(!banMisses)return unchanged(role,"official_ban_missing_matching_zero_minute_finals")
  const lastBanStart=banWeeks[0]
  // Require two separately verified, meaningful pre-suspension starts for
  // the same team, not a season aggregate or shirt-number name guess.
  const preStarts=[...(tactical||[])].filter(x=>
    x.started===true&&x.verified===true &&
    Number(x.team_id)===Number(teamId)&&
    Number.isInteger(Number(x.gameweek))&&
    Number(x.gameweek)<lastBanStart&&
    Number(x.gameweek)>=lastBanStart-4&&
    Number(x.minutes)>=65&&(!x.provider_xi||(weekly||[]).some(w=>Number(w.gameweek)===Number(x.gameweek)&&Number(w.match_id)===Number(x.match_id)&&w.is_final===true&&Number(w.minutes)>=65&&Math.abs(Number(w.minutes)-Number(x.minutes))<=10&&timestamp(w.source_updated_at)!==null&&timestamp(w.source_updated_at)<cutoff))&&timestamp(x.observed_at)!==null&&
    timestamp(x.observed_at)<cutoff)
  const distinct=[...new Set(preStarts.map(x=>Number(x.gameweek)))]
  if(distinct.length<2)return unchanged(role,"pre_ban_verified_starters_insufficient")
  const smoothed=(starts+1)/(played+2) // Beta(1,1), not 100% guarantee.
  // Ceiling is intentionally finite: no assumption a suspension return
  // guarantees starting over an active teammate.
  const targetWeight=Math.min(.88,smoothed)
  const corrected=bounded(Math.max(role,targetWeight))
  if(corrected-role<.025)return unchanged(role,"already_consistent_with_pre_ban_role")
  return {
    role:corrected,applied:true,delta:corrected-role,
    reason:"official_ban_served_pre_ban_starter_role_restored",
    evidence_weeks:distinct.sort((a,b)=>b-a).slice(0,3),
    ban_weeks:banWeeks,smoothed_starter_rate:smoothed
  }
}

/** Supplement tactical history with exact provider XI membership, never minutes alone.
 * Only completed, explicitly documented bans can trigger this fallback. */
export async function fetchSuspensionStartEvidence(sb,cases,targetWeek){
  const eligible=(cases||[]).filter(c=>Array.isArray(c.affected_gameweeks)&&c.affected_gameweeks.length&&Math.max(...c.affected_gameweeks.map(Number))===Number(targetWeek)-1)
  const out=new Map()
  for(const c of eligible){
    const first=Math.min(...c.affected_gameweeks.map(Number)),id=Number(c.player_id),team=Number(c.team_id)
    const [p,l]=await Promise.all([
      sb.from("scout_highlightly_player_matches").select("player_id,team_id,gameweek,match_id,provider_player_id,minutes,is_substitute,observed_at").eq("season","2026-27").eq("player_id",id).eq("team_id",team).gte("gameweek",Math.max(1,first-4)).lt("gameweek",first),
      sb.from("scout_highlightly_lineups").select("team_id,gameweek,match_id,starter_count,lineup,observed_at").eq("season","2026-27").eq("team_id",team).gte("gameweek",Math.max(1,first-4)).lt("gameweek",first)
    ])
    if(p.error)throw p.error
    if(l.error)throw l.error
    out.set(id,verifiedProviderStarts(p.data||[],l.data||[]))
  }
  return out
}
export function verifiedProviderStarts(players,lineups){
  return players.flatMap(p=>{
    if(p.is_substitute!==false||p.provider_player_id==null||Number(p.minutes)<65)return []
    const l=lineups.find(x=>Number(x.match_id)===Number(p.match_id)&&Number(x.team_id)===Number(p.team_id)&&Number(x.gameweek)===Number(p.gameweek)&&Number(x.starter_count)===11)
    const members=l?.lineup?.initialLineup
    if(!Array.isArray(members))return []
    const xi=members.flat()
    if(xi.length!==11||new Set(xi.map(x=>String(x.id))).size!==11||!xi.some(x=>String(x.id)===String(p.provider_player_id)))return []
    const times=[timestamp(p.observed_at),timestamp(l.observed_at)]
    if(times.some(x=>x===null))return []
    return [{...p,started:true,verified:true,provider_xi:true,observed_at:new Date(Math.max(...times)).toISOString()}]
  })
}
export function roleRowsWithoutVerifiedBans(weekly,cases,teamId,targetWeek,cutoffAt){
  const cutoff=timestamp(cutoffAt)
  if(cutoff===null)return weekly
  const weeks=new Set((cases||[]).filter(c=>Number(c.team_id)===Number(teamId)&&Array.isArray(c.affected_gameweeks)).flatMap(c=>c.affected_gameweeks.map(Number).filter(w=>w<Number(targetWeek))))
  return (weekly||[]).filter(w=>!(weeks.has(Number(w.gameweek))&&w.is_final===true&&w.minutes!=null&&Number(w.minutes)===0&&timestamp(w.source_updated_at)!==null&&timestamp(w.source_updated_at)<cutoff))
}
