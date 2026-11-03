import {trustedMinute} from "./momentum.mjs"

// Attack statistics can be sourced through MH9 while appearances/minutes have
// already advanced through MH10. Never divide an older xG/xA total by a newer
// exposure denominator; do not rewrite the original source observations.
const valid=(v)=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0
const clamp=(lo,hi,n)=>Math.max(lo,Math.min(hi,n))

export function alignAttackSourceWindow({stats,weekly=[],targetWeek}={}){
 const none={aligned:false,reason:"unverified_source_exposure",coveredMinutes:null,xgPer90:null,xaPer90:null,shotsPer90:null,keyPassesPer90:null}
 const current=Number(stats?.through_gameweek),advanced=Number(stats?.advanced_through_gameweek)
 const total=Number(stats?.minutes)
 if(!Number.isInteger(targetWeek)||!Number.isInteger(current)||!Number.isInteger(advanced)||
    current!==targetWeek-1||advanced<1||advanced>current||current-advanced>4||
    !valid(stats?.minutes)||total<270)return none
 const latest=new Map()
 for(const row of weekly){
   const week=Number(row.gameweek)
   if(week>advanced&&week<=current&&(!latest.has(week)||
     new Date(row.source_updated_at||0).getTime()>new Date(latest.get(week).source_updated_at||0).getTime()))
     latest.set(week,row)
 }
 let after=0
 for(let week=advanced+1;week<=current;week++){
   const row=latest.get(week)
   const minutes=trustedMinute(row)
   if(minutes===null||!Number.isFinite(minutes))return {...none,reason:"missing_post_advanced_week_minutes"}
   after+=minutes
 }
 const covered=total-after
 if(covered<270||covered>total||covered<=0)return {...none,reason:"invalid_source_exposure"}
 const xg=valid(stats.xg_total)?Number(stats.xg_total)*90/covered:null
 const xaTotal=valid(stats.xa_total)?Number(stats.xa_total)*90/covered:null
 const reported=valid(stats.xa_per90)?Number(stats.xa_per90):
   valid(stats.xa_model_per90)?Number(stats.xa_model_per90):null
 // Total and rate may come from differing provider windows. Anchor to the
 // correctly dated cumulative total; retain 20% of a plausible reported
 // source rate and bound the correction rather than trusting either blindly.
 const xa=xaTotal===null?null:reported===null||reported===0?xaTotal:
   clamp(reported*.70,reported*1.30,.8*xaTotal+.2*reported)
 return {aligned:true,reason:advanced===current?"matching_source_week":"subtracted_post_source_minutes",
   coveredMinutes:covered,advancedWeek:advanced,
   xgPer90:xg,xaPer90:xa,
   shotsPer90:valid(stats.shots)?90*Number(stats.shots)/covered:null,
   keyPassesPer90:valid(stats.key_passes)?90*Number(stats.key_passes)/covered:null}
}
