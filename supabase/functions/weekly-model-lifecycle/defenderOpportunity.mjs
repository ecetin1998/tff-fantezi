// Forecast-only: repeated observed opportunities, not a hot streak of goals
// and assists, determine how much DEF can claim of the team's goal events.
// The team match score/clean-sheet process and official scoring are unchanged.
const quality={
  CB:{shot:.095,keyPass:.055},
  FB:{shot:.090,keyPass:.070},
  WB:{shot:.090,keyPass:.075},
  DEF:{shot:.090,keyPass:.070},
}
const safe=(v)=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0
const norm=(r)=>["CB","FB","WB"].includes(String(r||"").toUpperCase())?String(r).toUpperCase():"DEF"

export function credibleAttackWeights(position,role,rates=[],forecastXg=null){
  const xg=forecastXg===null?safe(rates[0]):safe(forecastXg)
  const goals=safe(rates[1]),assists=safe(rates[2]),xa=safe(rates[3])
  if(position!=="DEF"){
    // The 15th rate is a bounded forward-only learning experiment. It
    // reallocates a team's sourced goals/assists among eligible teammates,
    // never subtracts from final fantasy points or changes team goal rates.
    // Absent/invalid marker is strictly the original 1.0 baseline.
    const feedback=Number(rates[14]);
    const eventFactor=position==="FWD"&&Number.isFinite(feedback)&&
      feedback>=.50&&feedback<=1?feedback:1;
    return {goal:Math.max(1e-6,(.75*xg+.25*goals)*eventFactor),
      assist:Math.max(1e-6,(.70*xa+.30*assists)*eventFactor),
      adjustedXg:xg,adjustedXa:xa,eventFactor};
  }
  const prior=quality[norm(role)]
  // rates[12] and [13] are ONLY aligned season-to-date key passes and
  // shots per 90. -1 means unknown/stale; absence NEVER implies 0.
  const shots=Number(rates[13]),keys=Number(rates[12])
  const validShots=Number.isFinite(shots)&&shots>=0
  const validKeys=Number.isFinite(keys)&&keys>=0
  const adjustedXg=validShots
    ?Math.min(xg,Math.max(.50*xg,1.25*prior.shot*shots+.012)):xg
  const adjustedXa=validKeys
    ?Math.min(xa,Math.max(.55*xa,.90*prior.keyPass*keys+.020)):xa
  // Defender goals/assists are rare, noisy season samples. Weight actual
  // finishing only 10%; verified chance creation gets the remaining 90%.
  return {goal:Math.max(1e-6,.90*adjustedXg+.10*goals),
    assist:Math.max(1e-6,.90*adjustedXa+.10*assists),
    adjustedXg,adjustedXa,validShots,validKeys}
}
