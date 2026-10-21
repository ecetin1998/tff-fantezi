// Forecast-only empirical Bayes shrinkage of rare defender scoring chances.
// Recorded goals, shots, xG and historical Fantasy points are never modified.
// In particular a single 0.57-xG chance in eight games is not assumed to
// recur every match just because it dominates the player's season xG/90.
const ROLE_PRIORS={
  CB:{xg:.027,goals:.040,shots:.30,quality:.09,priorMatches:8},
  FB:{xg:.022,goals:.046,shots:.50,quality:.07,priorMatches:6},
  WB:{xg:.080,goals:.080,shots:.85,quality:.095,priorMatches:6},
  DEF:{xg:.034,goals:.040,shots:.45,quality:.075,priorMatches:7},
}
const finite=v=>typeof v==="number"&&Number.isFinite(v)
const norm=v=>String(v||"").trim().toUpperCase().replace(/[ _-]+/g,"")
export function sparseChanceDefenderRates({
  position,role,xgPer90,goalsPer90,seasonMinutes,shots,
  advancedThroughGameweek,throughGameweek
}={}){
  const original={xgPer90,goalsPer90,applied:false,shotEvidenceTrusted:false,reason:"not_defender"}
  if(position!=="DEF")return original
  const key=norm(role),prior=ROLE_PRIORS[key]||ROLE_PRIORS.DEF
  if(!finite(xgPer90)||xgPer90<0||!finite(goalsPer90)||goalsPer90<0||
     !finite(seasonMinutes)||seasonMinutes<=0)
    return {...original,reason:"insufficient_season_evidence"}
  const played=seasonMinutes/90,k=prior.priorMatches
  const xgPosterior=(xgPer90*played+prior.xg*k)/(played+k)
  const goalsPosterior=(goalsPer90*played+prior.goals*k)/(played+k)
  let xgAdjusted=xgPosterior
  // Only join season-to-date shots to xG when BOTH are sourced through the
  // same matchweek; stale or anomalous shot totals cannot establish frequency.
  const validShots=Number.isInteger(shots)&&shots>=0&&shots<=Math.ceil(played*2.5+3)
    &&(shots>0||xgPer90===0)
    &&Number.isInteger(advancedThroughGameweek)
    &&Number.isInteger(throughGameweek)
    &&advancedThroughGameweek===throughGameweek
  if(validShots){
    const shotsPer90=(shots+prior.shots*k)/(played+k)
    const xgPerShot=(xgPer90*played+prior.quality*5)/(shots+5)
    xgAdjusted=Math.min(xgPosterior,shotsPer90*xgPerShot)
  }
  // Defenders with poor historical xG should not be promoted merely by a
  // generic prior. Discount only unsupported spikes in the scoring channel.
  const outXg=Math.min(xgPer90,xgAdjusted)
  const outGoals=Math.min(goalsPer90,goalsPosterior)
  return {
    xgPer90:Math.max(0,outXg),goalsPer90:Math.max(0,outGoals),
    applied:outXg<xgPer90-1e-9||outGoals<goalsPer90-1e-9,
    shotEvidenceTrusted:validShots,
    reason:validShots?"shots_frequency_and_quality":"role_prior_unaligned_shot_window",
    evidenceMatches:played,priorMatches:k
  }
}
