/**
 * Evidence-backed rising-player momentum, deliberately separate from goal/xA
 * rates. Weekly Fantasy points can be noisy (penalties, bonuses, set pieces);
 * only sustained MINUTES/ROLE are rewarded until recent xG/xA coverage exists.
 *
 * A 0-minute inferred nonparticipant in the independently-calculated MH8
 * ledger is UNKNOWN appearance evidence, not an independently verified bench.
 * Legacy zero-minute rows also cannot be used as negative minutes evidence.
 */
export const trustedMinute=(row)=>{
  if(!row||row.is_final!==true||row.minutes==null)return null
  const minutes=Number(row.minutes)
  if(!Number.isFinite(minutes)||minutes<0||minutes>130)return null
  const kind=String(row.source_kind||"")
  if(minutes===0&&kind!=="fresh_closed_actual")return null
  return minutes
}

export function risingMinutesMomentum(weekly, targetWeek, availability=1) {
  const none={rising:false,role_uplift:0,signal:null,evidence_weeks:[],recent_minutes:null,prior_minutes:null,reason:"insufficient_trusted_minutes"}
  if(!Number.isInteger(Number(targetWeek))||Number(targetWeek)<4)return none
  if(!(Number(availability)>=0.8))return {...none,reason:"availability_risk"}
  const byWeek=new Map()
  for(const row of weekly||[]) {
    const week=Number(row.gameweek)
    if(!Number.isInteger(week)||week>=Number(targetWeek)||byWeek.has(week))continue
    byWeek.set(week,row)
  }
  const latest=[Number(targetWeek)-1,Number(targetWeek)-2].map(week=>({week,minutes:trustedMinute(byWeek.get(week))}))
  if(latest.some(row=>row.minutes===null||row.minutes<45))return none
  const lastMean=(latest[0].minutes+latest[1].minutes)/2
  if(lastMean<65)return {...none,reason:"not_sustained"}
  const older=[Number(targetWeek)-3,Number(targetWeek)-4].map(week=>({week,minutes:trustedMinute(byWeek.get(week))}))
    .filter(row=>row.minutes!==null)
  if(!older.length)return none
  const priorMean=older.reduce((v,r)=>v+r.minutes,0)/older.length
  const delta=lastMean-priorMean
  if(delta<25)return {...none,recent_minutes:lastMean,prior_minutes:priorMean,reason:"not_rising"}
  // Small bounded *conditional lineup weight*, NOT an unconditional xFP
  // bonus or percentage-point addition to an actual XI probability.
  // With only one prior match, confidence / uplift are cut in half.
  const confidence=older.length===2?1:0.5
  const roleUplift=Math.round(Math.min(0.06,0.02+0.0005*(delta-25))*confidence*1e6)/1e6
  return {rising:true,role_uplift:roleUplift,signal:"ÇIKIŞTA • SÜRE ARTIŞI",
    evidence_weeks:[...latest,...older].map(x=>x.week),recent_minutes:lastMean,
    prior_minutes:priorMean,reason:"sustained_minutes_momentum"}
}
