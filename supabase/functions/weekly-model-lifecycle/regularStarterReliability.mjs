import {trustedMinute} from "./momentum.mjs"

/**
 * Use only recorded pre-kickoff starts as a reliability cross-check for
 * conditional team-XI selection weights. This is NOT an unconditional XI
 * probability and does not change team XI quotas, substitutions, or scoring.
 *
 * Season starts and appearances are provenance-backed aggregate counters.
 * The latest independently verified XI and 60+ final minutes are required,
 * so stale starters, injured players and unconfirmed 0-minute rows cannot
 * automatically receive a positive correction.
 */
const timestamp=value=>{const t=Date.parse(value||"");return Number.isFinite(t)?t:null}
const bounded=x=>Math.max(.01,Math.min(.995,x))
export function regularStarterReliability({
  baseline,seasonStarts,matchesPlayed,weekly=[],verified=[],tactical=[],teamId=null,
  targetWeek,cutoffAt,availability=1,alreadyApplied=false
}={}){
  const original=Number(baseline)
  const unchanged=reason=>({role:original,applied:false,delta:0,reason})
  const target=Number(targetWeek),cutoff=timestamp(cutoffAt)
  const starts=Number(seasonStarts),played=Number(matchesPlayed)
  if(!Number.isFinite(original)||original<=0||original>=1)return unchanged("invalid_baseline")
  if(alreadyApplied)return unchanged("season_reliability_already_applied")
  if(!Number.isInteger(target)||target<3||cutoff===null)return unchanged("invalid_cutoff")
  if(!(Number(availability)>=.8))return unchanged("availability_risk")
  if(!Number.isInteger(starts)||!Number.isInteger(played)||
     played<8||starts<6||starts>played||starts/played<.75)return unchanged("insufficient_regular_starts")
  const priorWeek=target-1
  const lastFinal=(weekly||[]).find(r=>Number(r.gameweek)===priorWeek&&
    Number.isFinite(timestamp(r.source_updated_at))&&timestamp(r.source_updated_at)<cutoff&&
    trustedMinute(r)!==null&&trustedMinute(r)>=60)

  const confirmed=(verified||[]).some(row=>
    Number(row.gameweek)===priorWeek&&row.started===true&&
    row.verified_first_11===true&&Number(row.minutes)>=60&&
    typeof row.source_url==="string"&&/^https:\/\//.test(row.source_url)&&
    timestamp(row.updated_at)!==null&&timestamp(row.updated_at)<cutoff)
  // Three explicit consecutive recent starts are stronger evidence of role
  // continuity than a single 60-minute threshold. Allow a 45–59-minute last
  // start only with >=60 average over all three verified starts, matching
  // final source minutes, current club and a pre-kickoff source timestamp.
  const consecutive=[priorWeek-2,priorWeek-1,priorWeek].map(week=>{
    const final=(weekly||[]).find(r=>Number(r.gameweek)===week&&
      timestamp(r.source_updated_at)!==null&&timestamp(r.source_updated_at)<cutoff&&
      trustedMinute(r)!==null&&trustedMinute(r)>=45)
    if(!final||teamId==null)return null
    return (tactical||[]).find(row=>Number(row.gameweek)===week&&
      Number(row.team_id)===Number(teamId)&&row.started===true&&row.verified===true&&
      Number(row.minutes)===trustedMinute(final)&&timestamp(row.observed_at)!==null&&
      timestamp(row.observed_at)<cutoff)||null
  })
  const last=consecutive[2]
  const repeated=consecutive.every(Boolean)&&Number(last.minutes)>=45&&Number(last.minutes)<60&&
    consecutive.reduce((sum,row)=>sum+Number(row.minutes),0)/3>=60
  if(!lastFinal&&!repeated)return unchanged("no_verified_recent_60_plus_minutes")
  if(!confirmed&&!repeated)return unchanged("no_pre_kickoff_verified_last_xi")
  // Beta(1,1) season starter fraction; do not overfit perfect 3-game streaks.
  // This is used only to resolve *positive* contradictions in an existing
  // role-weight estimate, not to overwrite independently sourced demotions.
  const smoothed=(starts+1)/(played+2)
  const delta=Math.min(.16,Math.max(0,smoothed-original))
  if(delta<.01)return unchanged("no_material_gap")
  return {role:bounded(original+delta),applied:true,delta,
    reason:repeated?"three_verified_recent_starts_and_regular_season":"verified_latest_xi_and_regular_season_starts",
    evidenceWeek:priorWeek,smoothedStarterRate:smoothed}
}
