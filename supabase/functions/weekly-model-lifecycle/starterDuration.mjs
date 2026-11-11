import {trustedMinute} from "./momentum.mjs"

// Starter stint and substitute appearance are different populations.
// A 5- or 16-minute bench cameo must never become a starter's exit minute.
// This affects every teammate's simulated minutes and event allocation.
const fallbackMinutes=[78,88]
const validDate=value=>{const t=Date.parse(value||"");return Number.isFinite(t)?t:null}
const legalMinute=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=130?Math.min(90,Math.round(n)):null}
const weighted=durations=>durations.map((_,i)=>durations.length-i).map((n,_,all)=>n/all.reduce((s,x)=>s+x,0))

export function starterDurationProfile({
  position,seasonStarts=0,weekly=[],verified=[],targetWeek,cutoffAt
}={}){
  if(position==="GK")return {durations:[90],duration_weights:[1],reason:"keeper_90",verified_starts:0}
  const cutoff=validDate(cutoffAt)
  const target=Number(targetWeek)
  const unavailable={durations:[...fallbackMinutes],duration_weights:[.5,.5],
    reason:"no_pre_kickoff_starter_duration_evidence",verified_starts:0}
  if(cutoff===null||!Number.isInteger(target))return {...unavailable,reason:"invalid_cutoff"}
  const starters=new Map()
  for(const row of verified||[]){
    const week=Number(row.gameweek),observed=validDate(row.observed_at),minutes=legalMinute(row.minutes)
    if(row.verified!==true||row.started!==true||!Number.isInteger(week)||
       week<1||week>=target||observed===null||observed>=cutoff||minutes===null)continue
    // Prefer independently verified starter usage over totals with unknown XI.
    if(!starters.has(week))starters.set(week,{minutes,verified:true})
  }
  const verifiedCount=starters.size
  // Only a player known to have STARTED may use a 60+ minute final appearance
  // as a weaker proxy. Never interpret a sub-60 bench cameo as a starter stint.
  if(Number(seasonStarts)>0){
    for(const row of weekly||[]){
      const week=Number(row.gameweek),stamp=validDate(row.source_updated_at)
      const minutes=trustedMinute(row)
      if(!Number.isInteger(week)||week<1||week>=target||stamp===null||stamp>=cutoff||
         minutes===null||minutes<60||starters.has(week))continue
      starters.set(week,{minutes:Math.min(90,Math.round(minutes)),verified:false})
    }
  }
  const ordered=[...starters.entries()].sort((a,b)=>b[0]-a[0]).slice(0,5)
  if(!ordered.length)return unavailable
  const durations=ordered.map(([,row])=>row.minutes)
  let durationWeights=weighted(durations)
  // A single verified early exit in an otherwise stable starter's season
  // is a real observation, not proof of a 33% future early-sub probability.
  // Keep that observed stint in the support, but shrink its *weight* toward
  // the source-backed season incidence (one of >=7 starts). If multiple
  // recent short starts exist, leave the trend untouched.
  const isolatedShort=Number(seasonStarts)>=7&&durations.length>=4&&
    ordered[0][1].verified===true&&durations[0]<60&&
    durations.slice(1).every(m=>m>=60)&&
    durations.slice(1).filter(m=>m>=70).length>=3
  if(isolatedShort&&durationWeights[0]>.14){
    const originalWeight=durationWeights[0]
    const cap=Math.min(.14,1/Number(seasonStarts))
    durationWeights=[cap,...durationWeights.slice(1).map(w=>w*(1-cap)/(1-originalWeight))]
  }
  return {durations,duration_weights:durationWeights,
    reason:(verifiedCount?"verified_starter_stints":"60_plus_final_proxy")+
      (isolatedShort?"_single_short_starter_shrunk":""),
    verified_starts:verifiedCount}
}
