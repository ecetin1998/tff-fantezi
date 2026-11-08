import {trustedMinute} from "./momentum.mjs"

/**
 * Conservative response to a verified prior-week starter whose current
 * conditional XI weight has fallen despite remaining available.
 * Weight is a log-odds input to the team lineup sampler, NOT an
 * unconditional probability and NOT a post-hoc xFP/minutes offset.
 * No effect on raw fantasy scoring, opposing team goals or frozen weeks.
 */
export function stabilizeVerifiedStarter({
  baseline,weekly=[],targetWeek,cutoffAt,availability=1,alreadyApplied=false
}={}){
  const original=Number(baseline)
  const unchanged=(reason)=>({role:original,applied:false,delta:0,reason})
  if(!Number.isFinite(original)||original<=0||original>=1)return unchanged("invalid_baseline")
  if(alreadyApplied)return unchanged("stable_baseline_already_adjusted")
  if(!(Number(availability)>=.8))return unchanged("availability_risk")
  if(original>=.68)return unchanged("already_favored")
  const cutoff=Date.parse(cutoffAt||"")
  if(!Number.isFinite(cutoff)||!Number.isInteger(Number(targetWeek)))return unchanged("invalid_cutoff")
  // The most recent calendar gameweek matters, not the latest non-null row.
  const sourced=(weekly||[]).filter(row=>{
    const minutes=trustedMinute(row)
    const observed=Date.parse(row.source_updated_at||"")
    return Number(row.gameweek)===Number(targetWeek)-1 &&
      minutes!==null&&minutes>=60&&Number.isFinite(observed)&&observed<cutoff
  })
  if(!sourced.length)return unchanged("no_pre_kickoff_verified_60")
  // A capped correction to the XI selection weight. Do not invent an
  // extra match or a guaranteed 55 minutes, and preserve lineup 990/11.
  const delta=Math.min(.14,Math.max(0,(.68-original)*.45))
  if(delta<=0)return unchanged("no_room")
  const role=Math.min(.93,original+delta)
  return {role,delta:role-original,applied:true,
    reason:"prior_week_60_plus_verified",evidenceWeek:Number(targetWeek)-1}
}
