/**
 * Official non-league match evidence affects availability/readiness, minutes
 * and lineup competition. It MUST NOT affect league Fantasy points or per90
 * scoring rates. Pure helper shared by MH rollovers and intraday refreshes.
 */
const clamp = (min,max,v) => Math.max(min,Math.min(max,v));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

/**
 * @param {{
 * baseline:number, durations:number[], durationWeights?:number[],
 * fixtureKickoff:string, evidence?:{minutes:number,started:boolean,
 *    squad_status:string,competition:string,finished_at:string,source_url:string},
 * sameSlotStarter?:boolean, availability?:number
 * }} input
 */
export function applyOfficialMinutesEvidence(input) {
  const baseline = clamp(.000001,.999999,num(input.baseline));
  const original = {
    role:baseline,
    durations:[...(input.durations||[])],
    duration_weights:[...(input.durationWeights||[])],
    applied:false,
  };
  const e=input.evidence;
  if(!e || num(input.availability) <= 0) return original;
  if(!e.source_url?.startsWith("https://")) return original;
  if(!["UEFA_CL","UEFA_EL","UEFA_ECL","TFF_CUP","NATIONAL_TEAM","OTHER_OFFICIAL"].includes(e.competition))
    return original;
  const startMs=Date.parse(input.fixtureKickoff||"");
  const finishedMs=Date.parse(e.finished_at||"");
  const ageDays=(startMs-finishedMs)/86400000;
  // Competition action strictly between source cutoff and next game, recent
  // enough to inform next-week rotations. No future or stale evidence.
  if(!Number.isFinite(ageDays) || ageDays<=0 || ageDays>21) return original;
  const minutes=clamp(0,90,num(e.minutes));
  const started=e.started===true;
  const benchUnused=e.squad_status==="unused" && !started && minutes===0;
  if(!started && minutes===0 && !benchUnused) return original;

  const national=e.competition==="NATIONAL_TEAM";
  const freshness=ageDays<=7 ? 1 : Math.max(.2,1-(ageDays-7)/17.5);
  const competitionFactor=national?.60:1;
  const restFactor=ageDays<2?.57:ageDays<3?.85:1;
  const comeback=baseline<.35 && started && minutes>=75;
  let target, weight;
  if(started && minutes>=75){
    target=.93;
    weight=comeback?.86:.67;
  }else if(started && minutes>=45){
    target=.78; weight=.60;
  }else if(started){
    target=.58; weight=.43;
  }else if(minutes>=30){
    target=.52; weight=.42;
  }else if(minutes>0){
    target=.37; weight=.32;
  }else if(benchUnused && input.sameSlotStarter===true){
    // Only a direct same-position competitor starting justifies a real
    // downward signal. A cup rotation or an unused defender is not proof
    // of lost league role.
    target=.22; weight=.57;
  }else return original;

  weight=clamp(0,.9,weight*freshness*competitionFactor*restFactor);
  const role=clamp(.01,.995,baseline + (target-baseline)*weight);
  if(minutes===0)return {...original,role,applied:true,source:e.source_url};

  const history=(input.durations||[]).map(Number).filter(v=>v>0&&Number.isFinite(v)).slice(0,4);
  const historyWeights=(input.durationWeights||[]).map(Number).slice(0,history.length);
  // A verified 90-minute return is much better evidence of match fitness
  // than the 1- or 13-minute comeback cameos stored in league history.
  const officialWeight=(started && minutes>=75)
    ? (comeback?.78:.59)*freshness*competitionFactor*restFactor
    : .33*freshness*competitionFactor*restFactor;
  const firstWeight=clamp(.12,.82,officialWeight);
  const raw=history.map((_,i)=>Math.max(.01,historyWeights[i]??(1/(i+1))));
  const sum=raw.reduce((a,b)=>a+b,0)||1;
  const durations=[minutes,...history].slice(0,5);
  const duration_weights=[firstWeight,...raw.map(w=>(1-firstWeight)*w/sum)].slice(0,5);
  const weightSum=duration_weights.reduce((a,b)=>a+b,0)||1;
  return {
    role,durations,duration_weights:duration_weights.map(w=>w/weightSum),
    applied:true,source:e.source_url,
  };
}


/**
 * Preserve genuinely observed zeroes. Missing / null upstream data must not
 * be cast to zero before evaluating a sourced prior or position fallback.
 * This helper is shared with model-input regression tests.
 */
export function firstRecordedRate(...values){
  for(const value of values){
    if(value===null||value===undefined||value==="")continue;
    const n=Number(value);
    if(Number.isFinite(n))return Math.max(0,n);
  }
  return 0;
}

/**
 * Existing playing time alone does not prove a stat has been observed.
 * Fall back to a sourced rate when the upstream total is missing (not zero).
 */
export function observedPer90(total,minutes,fallback=0){
  const m=Number(minutes);
  if(!(m>0))return firstRecordedRate(fallback);
  if(total===null||total===undefined||total==="")return firstRecordedRate(fallback);
  const value=Number(total);
  return Number.isFinite(value)?Math.max(0,value*90/m):firstRecordedRate(fallback);
}
