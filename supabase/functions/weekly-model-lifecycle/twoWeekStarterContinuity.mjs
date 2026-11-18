import {trustedMinute} from "./momentum.mjs"

/**
 * P0 playing-time continuity (conditional team-XI *weight*, not XI odds).
 *
 * Conservative rescue for two PRE-KICKOFF, independently finalized consecutive
 * 60+ minute appearances. Never use a later-imported tactical XI record or an
 * imputed 0-minute non-appearance. Scorer still selects exactly 11 starters
 * and allocates exactly 990 minutes per club and match.
 *
 * This is a second, weaker residual correction after previous positive starter
 * and regularity policies have run. The input baseline is held in immutable
 * weekly evidence, not recursively learned from previous intraday projections.
 */
const stamp=value=>{const x=Date.parse(value||"");return Number.isFinite(x)?x:null}
const bounded=v=>Math.max(.01,Math.min(.995,v))
export const P0_MINUTE_CONTINUITY_POLICY="two-week-continuity-checked-v1"
export function twoWeekStarterContinuity({
  baseline,position,weekly=[],targetWeek,cutoffAt,availability=1,
  alreadyApplied=false
}={}){
  const previous=Number(baseline)
  const unchanged=reason=>({role:previous,delta:0,applied:false,reason,evidence_weeks:[]})
  const gw=Number(targetWeek),cutoff=stamp(cutoffAt)
  if(!Number.isFinite(previous)||previous<=0||previous>=1)return unchanged("invalid_base_role")
  if(alreadyApplied)return unchanged("already_in_stable_pre_kickoff_base")
  if(!Number.isInteger(gw)||gw<3||cutoff===null)return unchanged("invalid_cutoff")
  if(String(position)==="GK")return unchanged("keeper_not_eligible")
  if(!(Number(availability)>=.8))return unchanged("availability_not_trusted")
  if(previous>=.6)return unchanged("already_regular_selection_weight")
  const dates=[gw-1,gw-2],history=[]
  for(const week of dates){
    const valid=weekly.filter(row=>Number(row.gameweek)===week&&
      row.is_final===true&&
      stamp(row.source_updated_at)!==null&&stamp(row.source_updated_at)<cutoff&&
      trustedMinute(row)!==null&&trustedMinute(row)>=60)
    // Duplicated/conflicting rows are not a trusted single appearance.
    if(valid.length!==1)return unchanged("two_consecutive_final_60_min_missing")
    history.push({week,minutes:trustedMinute(valid[0])})
  }
  // Smaller than existing 0.14/0.16 capped rescue rules. Clamp the final
  // probability to preserve the 0/1-safe conditional softmax sampler.
  const delta=Math.min(.12,Math.max(0,.35*(.65-previous)))
  if(delta<.005)return unchanged("no_material_gap")
  const role=bounded(previous+delta)
  return {role,delta:role-previous,applied:true,
    reason:"two_independent_60_plus_minutes_before_kickoff",
    evidence_weeks:dates,source_minutes:history.map(x=>x.minutes)}
}
