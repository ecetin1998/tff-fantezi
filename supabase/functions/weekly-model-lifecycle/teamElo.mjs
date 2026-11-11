// Deterministic pre-kickoff source-closed club Elo, not betting odds.
// Beta=0.10 was selected exclusively on frozen MH7-9; it improved Poisson
// NLL in EACH independent pre-kickoff frozen holdout MH10 and MH11.
// Does NOT infer player Elo (separate candidate failed MH10 holdout).
const K=20, HOME_ELO=65, BETA=.10, MAX_LOG_SHIFT=.12;
const validDate=x=>{const t=Date.parse(x||"");return Number.isFinite(t)?t:null}
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x))
export const TEAM_ELO_POLICY="team-elo-v1-frozen-MH7-9-train-MH10-11-holdout"
export function teamEloFromClosed(history=[],{targetWeek,cutoffAt}={}){
  const cutoff=validDate(cutoffAt),week=Number(targetWeek)
  if(cutoff===null||!Number.isInteger(week)||week<2)
    return {ratings:{},matches:0,policy:TEAM_ELO_POLICY,ready:false}
  const matches=(history||[]).filter(m=>{
    const at=validDate(m.kickoff_at)
    return Number(m.gameweek)>0&&Number(m.gameweek)<week&&at!==null&&at<cutoff&&
      // Football final scores are independent of fantasy score adjudication;
      // old MH1-5 fantasy_closure remains pending, but sourced FT goals are
      // valid historical Elo evidence available before MH12 kickoff.
      m.match_status==="Bitti"&&
      Number.isFinite(Number(m.home_goals))&&m.home_goals!==null&&
      Number.isFinite(Number(m.away_goals))&&m.away_goals!==null&&
      Number.isSafeInteger(Number(m.home_team_id))&&Number.isSafeInteger(Number(m.away_team_id))&&
      Number(m.home_team_id)!==Number(m.away_team_id)
  }).sort((a,b)=>validDate(a.kickoff_at)-validDate(b.kickoff_at)||Number(a.match_id)-Number(b.match_id))
  const ratings=new Map(),counts=new Map(),seen=new Set()
  const get=id=>ratings.get(id)??1500
  for(let i=0;i<matches.length;){
    let j=i;while(j<matches.length&&matches[j].kickoff_at===matches[i].kickoff_at)j++
    const updates=new Map()
    for(let k=i;k<j;k++){
      const m=matches[k],hid=Number(m.home_team_id),aid=Number(m.away_team_id)
      if(seen.has(m.match_id))throw Error("TEAM_ELO_DUPLICATE_CLOSED_MATCH_"+m.match_id)
      seen.add(m.match_id)
      const h=get(hid),a=get(aid)
      const expected=1/(1+Math.pow(10,(a-h-HOME_ELO)/400))
      const homeGoals=Number(m.home_goals),awayGoals=Number(m.away_goals)
      const outcome=homeGoals>awayGoals?1:homeGoals===awayGoals?.5:0
      const margin=Math.min(1.4,1+.18*Math.log1p(Math.max(0,Math.abs(homeGoals-awayGoals)-1)))
      const change=K*margin*(outcome-expected)
      updates.set(hid,(updates.get(hid)||0)+change)
      updates.set(aid,(updates.get(aid)||0)-change)
      counts.set(hid,(counts.get(hid)||0)+1)
      counts.set(aid,(counts.get(aid)||0)+1)
    }
    for(const [id,change] of updates)ratings.set(id,get(id)+change)
    i=j
  }
  return {ratings:Object.fromEntries(ratings),exposure:Object.fromEntries(counts),
    matches:seen.size,ready:seen.size>=45,policy:TEAM_ELO_POLICY}
}
export function teamEloMatchFactor({homeId,awayId,history,targetWeek,cutoffAt,homeLambda,awayLambda}={}){
  const prior=teamEloFromClosed(history,{targetWeek,cutoffAt}),h=Number(homeId),a=Number(awayId)
  if(!prior.ready||!Number.isFinite(Number(homeLambda))||!Number.isFinite(Number(awayLambda))||
      !(homeLambda>0&&awayLambda>0)||(prior.exposure[h]||0)<5||(prior.exposure[a]||0)<5)
    return {homeLambda,awayLambda,applied:false,policy:TEAM_ELO_POLICY,matches:prior.matches,shift:0}
  const shift=clamp(BETA*((prior.ratings[h]-prior.ratings[a])/100),-MAX_LOG_SHIFT,MAX_LOG_SHIFT)
  return {homeLambda:Math.max(.01,homeLambda*Math.exp(shift)),
    awayLambda:Math.max(.01,awayLambda*Math.exp(-shift)),applied:true,
    policy:TEAM_ELO_POLICY,matches:prior.matches,shift,homeElo:prior.ratings[h],awayElo:prior.ratings[a]}
}
