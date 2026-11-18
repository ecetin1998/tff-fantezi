import {trustedMinute} from "./momentum.mjs"

/**
 * Two-consecutive-week starter-continuity challenger, calibrated on
 * pre-kickoff source snapshots, not realized target-week outcomes.
 *
 * This is a small conditional team-XI selection weight, NOT a percentage
 * point change to the final XI probability or a post-hoc xFP adjustment.
 * Source final minutes are not proof of being in the starting XI: those
 * conditions remain separate in the team's 11-player sampler.
 */
const timestamp=v=>{
  if(typeof v!=="string"||!v.trim())return null
  const t=Date.parse(v)
  return Number.isFinite(t)?t:null
}
const no=(baseline,reason)=>({role:baseline,applied:false,delta:0,reason,evidence_weeks:[]})
export function sustainedStarterContinuity({
  baseline,position,weekly=[],targetWeek,cutoffAt,availability=1,alreadyApplied=false
}={}){
  const prior=Number(baseline),target=Number(targetWeek),cutoff=timestamp(cutoffAt)
  if(!Number.isFinite(prior)||prior<=0||prior>=1)return no(prior,"invalid_role_weight")
  if(alreadyApplied)return no(prior,"already_applied_in_stable_source")
  if(position==="GK")return no(prior,"goalkeeper_excluded")
  if(!Number.isInteger(target)||target<3||cutoff===null)return no(prior,"invalid_cutoff")
  if(!(Number(availability)>=.8))return no(prior,"availability_risk")
  if(prior>=.68)return no(prior,"role_already_strong")
  const byWeek=new Map()
  for(const row of weekly||[]){
    const week=Number(row?.gameweek)
    if(week!==target-1&&week!==target-2)continue
    if(byWeek.has(week))return no(prior,"duplicated_final_week_evidence")
    byWeek.set(week,row)
  }
  for(const week of [target-2,target-1]){
    const row=byWeek.get(week)
    const imported=timestamp(row?.created_at),observed=timestamp(row?.source_updated_at)
    const kind=String(row?.source_kind||"")
    const independent=kind==="fresh_closed_actual"||
      kind==="independently_calculated_source_events"||
      /^mh\d+_owner_approved_independent_score_events$/.test(kind)
    if(!row||!independent||row.is_final!==true||trustedMinute(row)===null||
      trustedMinute(row)<60||imported===null||observed===null||
      imported>=cutoff||observed>=cutoff){
      return no(prior,"two_consecutive_pre_kickoff_60_plus_missing")
    }
  }
  // Pre-registered bounded gain of the source-confirmed repeat. Not used
  // when a team-specific verified official demotion or ban overrides it.
  const delta=Math.min(.12,Math.max(0,(.68-prior)*.35))
  if(delta<.0001)return no(prior,"no_material_gap")
  return {role:Math.min(.995,prior+delta),applied:true,delta,
    reason:"source_confirmed_two_consecutive_60_plus",
    evidence_weeks:[target-2,target-1]}
}
