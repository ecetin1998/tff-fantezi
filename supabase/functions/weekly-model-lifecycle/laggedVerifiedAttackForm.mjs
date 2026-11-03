import {trustedMinute} from "./momentum.mjs"

// Used only when the strict three-consecutive-week action-trend gate is
// unavailable. Two independently verified match xG/xA observations are
// permitted at most one missing latest week, with substantial shrinkage.
// This is not a raw Fantasy-points hot-streak bonus.
const valid=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0
const clamp=(lo,hi,n)=>Math.max(lo,Math.min(hi,n))
const before=(value,cutoff)=>!cutoff||
  (Boolean(value)&&Number.isFinite(new Date(value).getTime())&&new Date(value).getTime()<new Date(cutoff).getTime())

export function laggedVerifiedAttackForm({
  position,weekly=[],verified=[],targetWeek,cutoffAt=null,xgPer90,xaPer90
}={}){
 const none={xgPer90,xaPer90,applied:false,reason:"insufficient_recent_verified_xg_xa",weeks:[],xgFactor:1,xaFactor:1}
 if(position==="GK"||!["DEF","MID","FWD"].includes(position)||
   !Number.isInteger(targetWeek)||targetWeek<4||
   (cutoffAt&&!Number.isFinite(new Date(cutoffAt).getTime())))
   return none
 const w=new Map(weekly.filter(row=>before(row.source_updated_at,cutoffAt))
   .map(row=>[Number(row.gameweek),row]))
 const v=new Map(verified.filter(row=>before(row.observed_at,cutoffAt))
   .map(row=>[Number(row.gameweek),row]))
 // Prefer last two weeks; otherwise MH-2/MH-3 only if the last week has
 // no verified xG/xA, not when a negative performance was actually observed.
 let weeks=[targetWeek-1,targetWeek-2]
 const latest=v.get(weeks[0])
 if(!latest)weeks=[targetWeek-2,targetWeek-3]
 const evidence=weeks.map(week=>({week,minutes:trustedMinute(w.get(week)),event:v.get(week)}))
 if(evidence.some(x=>x.minutes===null||x.minutes<45||!x.event))return none
 const minutes=evidence.reduce((sum,x)=>sum+x.minutes,0)
 if(minutes<135)return none
 const staleness=weeks[0]===targetWeek-2?.80:1
 function signal(metric,activity,baseline){
   if(!valid(baseline)||Number(baseline)<.025)return 1
   if(evidence.some(x=>!valid(x.event[metric])||!Number.isInteger(Number(x.event[activity]))||
      Number(x.event[activity])<1))return 1
   const series=evidence.map(x=>Number(x.event[metric]))
   if(series.every(x=>x<.015))return 1
   // A single large chance/assist outlier cannot dominate two-week form.
   const capped=series.reduce((sum,x)=>sum+Math.min(metric==="xg"?.60:.55,x),0)
   const observed=90*capped/minutes
   const ratio=clamp(.25,3,(observed+.025)/(Number(baseline)+.025))
   const delta=clamp(-.10,.16,Math.log(ratio)*.26*staleness)
   return 1+delta
 }
 const xgFactor=signal("xg","shots",xgPer90)
 const xaFactor=signal("xa","key_passes",xaPer90)
 const result={xgPer90:valid(xgPer90)?Number(xgPer90)*xgFactor:xgPer90,
   xaPer90:valid(xaPer90)?Number(xaPer90)*xaFactor:xaPer90,
   applied:Math.abs(xgFactor-1)>1e-9||Math.abs(xaFactor-1)>1e-9,
   reason:"two_consecutive_verified_attacking_weeks_shrunk",
   weeks,xgFactor,xaFactor,staleness}
 return result
}
