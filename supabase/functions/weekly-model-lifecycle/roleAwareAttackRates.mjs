import {sparseChanceDefenderRates} from "./sparseChanceDefender.mjs"

// Scoring category is fixed by Fantasy registration; tactical role informs
// *forecast* priors. Calibrations run on original stable inputs, never on
// previous calibrated forecasts, and never rewrite source facts.
const ROLE={
 CB:{xg:.027,xa:.013,k:8},FB:{xg:.021,xa:.060,k:6},
 WB:{xg:.080,xa:.107,k:4},DM:{xg:.033,xa:.049,k:6},
 CM:{xg:.037,xa:.050,k:5},AM:{xg:.070,xa:.095,k:4},
 WM:{xg:.115,xa:.110,k:4},W:{xg:.127,xa:.104,k:4},
 SS:{xg:.200,xa:.075,k:3},ST:{xg:.280,xa:.031,k:3},
 DEF:{xg:.032,xa:.045,k:7},MID:{xg:.100,xa:.075,k:5},
 FWD:{xg:.250,xa:.045,k:3},
};
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function calibrateAttackRates({
 position,role,seasonMinutes,seasonWeek,advancedWeek,shots,keyPasses,
 xgPer90,goalsPer90,xaPer90,assistsPer90
}={}){
 const original={xgPer90,goalsPer90,xaPer90,assistsPer90,applied:false,
   confidence:"unknown",sourceAligned:false,reason:"unavailable"}
 if(position==='GK'||!['DEF','MID','FWD'].includes(position)||!positive(seasonMinutes)||seasonMinutes===0||
    !positive(xgPer90)||!positive(goalsPer90))return original
 const roleCode=ROLE[role]?role:position;
 const prior=ROLE[roleCode],exp=seasonMinutes/90;
 // Stats denominators must match. Missing or stale shots CANNOT imply no shots.
 const aligned=Number.isInteger(advancedWeek)&&Number.isInteger(seasonWeek)&&advancedWeek===seasonWeek;
 const trustedShots=aligned&&Number.isInteger(shots)&&shots>=0&&
   shots<=Math.ceil(exp*8+3)&&(shots>0||xgPer90===0);
 const trustedPasses=aligned&&Number.isInteger(keyPasses)&&keyPasses>=0&&keyPasses<=Math.ceil(exp*12+3);
 if(roleCode==='CB'&&position==='DEF'){
   const cb=sparseChanceDefenderRates({position,role:roleCode,xgPer90,goalsPer90,
     seasonMinutes,shots:trustedShots?shots:null,
     advancedThroughGameweek:advancedWeek,throughGameweek:seasonWeek})
   // A proven CB scoring spike is heavily discounted, but the real xA
   // remains independent of chance-conversion reliability.
   return {...original,xgPer90:cb.xgPer90,goalsPer90:cb.goalsPer90,
     applied:cb.applied,confidence:trustedShots?'medium':'low',
     sourceAligned:trustedShots,reason:'cb_sparse_opportunity_bayes'}
 }
 const posterior=(rate,target)=>((rate*exp)+(target*prior.k))/(exp+prior.k)
 // Even with bad/missing shots, never blanket-cut creative fullbacks,
 // real wingers or centre-forwards. Exposure and plausible repeated shooting
 // limit the maximum drop independently from the Bayesian prior.
 const shotRate=trustedShots?shots/exp:null
 const regularShooting=shotRate!==null&&shotRate>=
   (roleCode==='ST'?.95:roleCode==='W'||roleCode==='AM'?.65:.45);
 const maxXgReduction=regularShooting?.04:exp>=6?.10:.18
 const proposal=posterior(xgPer90,prior.xg)
 const nextXg=Math.min(xgPer90,Math.max(xgPer90*(1-maxXgReduction),proposal))
 // A one-goal finishing surge with few minutes is weak evidence, but players
 // with repeated appearances or consistent chance creation retain their skill.
 const nextGoals=exp<5&&goalsPer90>Math.max(xgPer90*1.7,prior.xg*2)
   ?Math.max(goalsPer90*.83,posterior(goalsPer90,prior.xg))
   :goalsPer90
 // Creation is treated separately: only comparable, non-corrupt, current
 // key-pass evidence permits additional regression of an xA outlier.
 const nextXa=positive(xaPer90)&&trustedPasses&&xaPer90>prior.xa*2.0&&exp<6
   ?Math.max(xaPer90*.88,posterior(xaPer90,prior.xa)):xaPer90
 return {
   xgPer90:nextXg,goalsPer90:nextGoals,xaPer90:nextXa,
   assistsPer90,applied:nextXg<xgPer90-1e-9||nextGoals<goalsPer90-1e-9||
     (positive(xaPer90)&&positive(nextXa)&&nextXa<xaPer90-1e-9),
   confidence:trustedShots&&trustedPasses?'high':trustedShots?'medium':'low',
   sourceAligned:trustedShots,reason:trustedShots?'aligned_shot_recurrence':'source_stale_or_missing',
   tacticalRole:roleCode
 }
}
