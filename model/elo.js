const DEFAULT_ELO=1500
function expectedScore(home,away,homeAdvantage=60){return 1/(1+10**((away-(home+homeAdvantage))/400))}
function computeEloRatings(history,k=24,homeAdvantage=60){
  const ratings=new Map(),get=id=>ratings.get(Number(id))??DEFAULT_ELO
  for(const m of [...(history||[])].sort((a,b)=>new Date(a.kickoff_at||0)-new Date(b.kickoff_at||0))){
    const h=Number(m.home_team_id),a=Number(m.away_team_id);if(!h||!a||m.home_goals==null||m.away_goals==null)continue
    const rh=get(h),ra=get(a),eh=expectedScore(rh,ra,homeAdvantage),actual=Number(m.home_goals)>Number(m.away_goals)?1:Number(m.home_goals)<Number(m.away_goals)?0:.5,margin=Math.max(1,Math.abs(Number(m.home_goals)-Number(m.away_goals))),delta=k*Math.log1p(margin)*(actual-eh)
    ratings.set(h,rh+delta);ratings.set(a,ra-delta)
  }
  return Object.fromEntries([...ratings.entries()].map(([id,r])=>[id,Number(r.toFixed(2))]))
}
function eloLambdaFactors(homeElo,awayElo,homeAdvantage=60){const p=expectedScore(Number(homeElo||DEFAULT_ELO),Number(awayElo||DEFAULT_ELO),homeAdvantage),shift=(p-.5)*.5;return {home:Math.exp(shift),away:Math.exp(-shift),homeWinPrior:p}}
module.exports={DEFAULT_ELO,expectedScore,computeEloRatings,eloLambdaFactors}
