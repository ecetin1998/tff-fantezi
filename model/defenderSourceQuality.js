'use strict'

// Read-only source lineage audit. Do NOT use this to rewrite observed xA,
// historical actuals, or published model inputs without independent evidence.
function inspectDefenderXa(evidence, {shrinkToSample=.8}={}) {
  const id=Number(evidence.player_id)
  const xaTotal=Number(evidence.source_xa_total)
  const xa90=Number(evidence.source_xa90)
  const prior=Number(evidence.model_prior_xa90)
  const minutes=Number(evidence.minutes_through_mh7)
  const gameweek=Number(evidence.advanced_through_gameweek)
  if(!Number.isInteger(id)||id<=0||!Number.isFinite(xaTotal)||xaTotal<0||
     !Number.isFinite(xa90)||xa90<0||!Number.isFinite(prior)||prior<0||
     !Number.isFinite(minutes)||minutes<360||gameweek!==7 ||
     !['CB','FB','WB'].includes(evidence.role))
    throw new Error('Not comparable: defender role, source week, known minutes and nonnegative xA required')
  const implied=xaTotal*90/minutes
  const suspicious=xa90>.12&&xa90-implied>=.12&&xa90>2.5*Math.max(.001,implied)
  const candidate=.8*implied+.2*prior
  return {player_id:id,role:evidence.role,source_xa90:xa90,implied_xa90:implied,
    candidate_xa90:candidate,absolute_gap:xa90-implied,
    suspicious,source_name:evidence.source||null,auto_publish_allowed:false}
}

function inspectShots({role,shots,shots_on_target,minutes}) {
  const n=Number(shots),sot=Number(shots_on_target),mins=Number(minutes)
  if(!['CB','FB','WB'].includes(role)||!Number.isFinite(n)||!Number.isFinite(sot)
    ||!Number.isFinite(mins)||mins<0)return {review:false,reason:'not_comparable'}
  if(n<0||sot<0||sot>n)return {review:true,reason:'invalid_shot_totals'}
  // Flag for source verification, never overwrite with zeros.
  if(role==='CB'&&mins>=180&&n>Math.max(20,mins/90*5))
    return {review:true,reason:'implausible_stopper_shot_volume'}
  return {review:false,reason:null}
}

module.exports={inspectDefenderXa,inspectShots}
