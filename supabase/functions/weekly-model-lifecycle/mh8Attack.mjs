// Bayesian single-match adjustment. Keep the established season prior dominant:
// one MH8 observation must never be treated as a whole-season rate or be
// mistaken for zero when the source did not report that statistic.
export function blendVerifiedAttackRate(prior,matchValue,verifiedMinutes,metric){
  if(matchValue===null||matchValue===undefined||!Number.isFinite(matchValue)||
     !Number.isFinite(verifiedMinutes)||verifiedMinutes<=0||verifiedMinutes>130||
     !Number.isFinite(prior)||prior<0)return {rate:prior,applied:false}
  if(metric!=="xg"&&metric!=="xa")return {rate:prior,applied:false}
  if(matchValue<0||matchValue>8)return {rate:prior,applied:false}
  const strength=720 // 8 full matches of prior evidence
  const posterior=(prior*strength+90*matchValue)/(strength+verifiedMinutes)
  const limit=Math.min(metric==="xg"?.12:.08,Math.max(.03,prior*.20))
  const rate=Math.max(0,Math.min(prior+limit,Math.max(prior-limit,posterior)))
  return {rate,applied:true}
}
