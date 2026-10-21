import {trustedMinute} from "./momentum.mjs"

// Compare calendar weeks, not a compressed list of non-null observations.
// Missing historic evidence is unknown, never a proved zero-minute benching.
export function roleTrendFromWeeklyEvidence(rows,targetWeek) {
  const byWeek=new Map()
  for(const row of rows||[]){
    const week=Number(row.gameweek)
    if(!byWeek.has(week))byWeek.set(week,row)
  }
  const minutes=(week)=>trustedMinute(byWeek.get(week))
  const latest=[minutes(targetWeek-1),minutes(targetWeek-2)]
  const previous=[minutes(targetWeek-3),minutes(targetWeek-4)]
  const valid=(xs)=>xs.filter((x)=>x!==null)
  const avg=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0
  const xi=(xs)=>avg(xs.map((x)=>Math.max(0,Math.min(1,x/60))))
  const recent=valid(latest),older=valid(previous)
  const last2Xi=xi(recent),prev2Xi=xi(older)
  return {
    last2Min:avg(recent),prev2Min:avg(older),last2Xi,prev2Xi,
    // Both immediately preceding weeks and at least one older comparator
    // must be verified; otherwise there is no defensible direction label.
    trend:recent.length===2&&older.length>=1?last2Xi-prev2Xi:null
  }
}
