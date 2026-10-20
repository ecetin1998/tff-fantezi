/**
 * Reconcile defender xA rate used in NEW model simulations.
 * Raw scouting/provider data is never overwritten. A flagged provider xA/90
 * may reflect another dated window, so normalize a SAME-WEEK cumulative
 * xA total by positively confirmed minutes, and shrink 20% to prior.
 * Only supported GW source alignment is accepted; else retain original.
 */
export function reconcileDefenderXa(stats,player,confirmedLastWeek,originalRate) {
  const unchanged={rate:originalRate,adjusted:false,reason:"unaligned_or_consistent",implied:null}
  if (!stats || player?.position!=="DEF" || !["CB","FB","WB"].includes(String(player.primary_role||"").toUpperCase()))
    return unchanged
  const last=confirmedLastWeek
  if(!last || last.is_final!==true||last.minutes==null||Number(last.minutes)<0||
     // We need an explicitly sourced last-week appearance when the annual
     // season minutes have already advanced one gameweek.
     Number(last.minutes)===0 ||
     !["fresh_closed_actual","independently_calculated_source_events"].includes(String(last.source_kind||"")))
    return unchanged
  const currentGW=Number(stats.through_gameweek),advancedGW=Number(stats.advanced_through_gameweek)
  const seasonMinutes=Number(stats.minutes),lastMins=Number(last.minutes)
  if(!(Number.isInteger(currentGW)&&currentGW===advancedGW+1&&
       Number.isFinite(seasonMinutes)&&Number.isFinite(lastMins)&&lastMins<=130))
    return unchanged
  const covered=seasonMinutes-lastMins
  const total=stats.xa_total==null?NaN:Number(stats.xa_total)
  const reported=stats.xa_per90==null?NaN:Number(stats.xa_per90)
  if(!(covered>=360 && Number.isFinite(total)&&total>=0&&
       Number.isFinite(reported)&&reported>=0))return unchanged
  const implied=90*total/covered
  const gap=reported-implied
  if(!(reported>0.12&&gap>=0.12&&reported>=2.5*Math.max(implied,0.0001)))
    return {...unchanged,implied}
  const rawPrior=stats.xa_model_per90==null?NaN:Number(stats.xa_model_per90)
  const prior=Number.isFinite(rawPrior)&&rawPrior>=0?rawPrior:implied
  const rate=0.8*implied+0.2*prior
  if(!Number.isFinite(rate)||rate<0)return unchanged
  return {rate,adjusted:true,reason:"source_coverage_normalized_xa_v1",
    implied,reported,source_minutes:covered,source_label:stats.xa_source||null}
}
