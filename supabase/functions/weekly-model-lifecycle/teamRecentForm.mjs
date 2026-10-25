// Read-only, leakage-safe team form from CLOSED historical fixtures.
// Last 3 scoring/conceding games are shrunk against prior season form.
// Do not change xG/xGA source, inferred sides, or historical Fantasy actuals.
const clamp=(a,b,v)=>Math.max(a,Math.min(b,v))
function finite(n){return typeof n==="number"&&Number.isFinite(n)}
export function recentTeamForm({teamId,gameweek,matches=[]}={}){
  const id=Number(teamId),gw=Number(gameweek)
  const none={ready:false,reason:"insufficient_pre_kickoff_verified_matches",gfRatio:1,gaRatio:1,scoreWeeks:[],csRate:null}
  if(!Number.isSafeInteger(id)||!Number.isInteger(gw)||gw<=5)return none
  const rows=[]
  for(const m of matches||[]){
    const wk=Number(m.gameweek),home=Number(m.home_team_id)===id,away=Number(m.away_team_id)===id
    if(!(wk<gw&&wk>=1&&(home!==away))||m.match_status!=="Bitti"||
       m.fantasy_closure!=="KAPANDI")continue
    const gf=Number(home?m.home_goals:m.away_goals),ga=Number(home?m.away_goals:m.home_goals)
    if(!Number.isInteger(gf)||!Number.isInteger(ga)||gf<0||ga<0||gf>15||ga>15)continue
    rows.push({wk,gf,ga})
  }
  rows.sort((a,b)=>a.wk-b.wk)
  const uniqueWeeks=new Set(rows.map(x=>x.wk))
  if(rows.length<5||uniqueWeeks.size!==rows.length)return none
  const last=rows.slice(-3)
  if(last.length!==3||last[2].wk!==gw-1||last[1].wk!==gw-2||last[0].wk!==gw-3)return none
  const mean=(arr,field)=>arr.reduce((sum,x)=>sum+x[field],0)/arr.length
  const gfRatio=clamp(.7,1.3,(mean(last,"gf")+1)/(mean(rows,"gf")+1))
  const gaRatio=clamp(.7,1.3,(mean(last,"ga")+1)/(mean(rows,"ga")+1))
  return {ready:true,reason:"three_consecutive_verified_weeks",
    gfRatio,gaRatio,scoreWeeks:last.map(x=>x.wk),
    csRate:last.filter(x=>x.ga===0).length/3}
}
export function applyTeamMatchForm({
  baselineHome,baselineAway,homeTeamId,awayTeamId,gameweek,matches=[]
}={}){
  const home=recentTeamForm({teamId:homeTeamId,gameweek,matches})
  const away=recentTeamForm({teamId:awayTeamId,gameweek,matches})
  if(!finite(baselineHome)||!finite(baselineAway)||baselineHome<=0||baselineAway<=0||!home.ready||!away.ready)
    return {homeLambda:baselineHome,awayLambda:baselineAway,applied:false,home,away,reason:"missing_verified_team_form"}
  // Fixed .2 chosen before promotion. Not tuned to post-kickoff outcomes.
  const effect=(att,def)=>Math.exp(.2*(Math.log(att.gfRatio)+Math.log(def.gaRatio))/2)
  const homeLambda=clamp(.2,4,baselineHome*effect(home,away))
  const awayLambda=clamp(.2,4,baselineAway*effect(away,home))
  return {homeLambda,awayLambda,
    applied:Math.abs(homeLambda-baselineHome)>1e-8||Math.abs(awayLambda-baselineAway)>1e-8,
    home,away,reason:"verified_last3_gf_ga_shrunk"}
}
export function auditMatchAllocation({
  gameweek,fixtures=[],matchInputs=[],playerInputs=[],roleShares=[]
}={}){
  const failures=[],warnings=[]
  if(fixtures.length!==9||matchInputs.length!==9)failures.push("MATCH_COUNT_NOT_9")
  const teams=new Set()
  const byMatch=new Map(matchInputs.map(x=>[Number(x.match_id),x]))
  for(const fixture of fixtures){
    const home=Number(fixture.home_team_id),away=Number(fixture.away_team_id)
    if(home===away||teams.has(home)||teams.has(away))failures.push("DUPLICATE_OR_SELF_TEAM_FIXTURE")
    teams.add(home);teams.add(away)
    const prediction=byMatch.get(Number(fixture.match_id))
    if(!prediction)failures.push("MISSING_FIXTURE_INPUT")
    else if(home!==Number(prediction.home_team_id)||away!==Number(prediction.away_team_id)||
            !finite(Number(prediction.home_lambda))||!finite(Number(prediction.away_lambda))||
            Number(prediction.home_lambda)<.2||Number(prediction.home_lambda)>4||
            Number(prediction.away_lambda)<.2||Number(prediction.away_lambda)>4)
      failures.push("INVALID_MATCH_LAMBDA_OR_ID")
  }
  if(teams.size!==18)failures.push("TEAM_COVERAGE_INCOMPLETE")
  if(playerInputs.length!==456)failures.push("PLAYER_COVERAGE_NOT_456")
  const players=new Map(playerInputs.map(x=>[Number(x.player_id),x]))
  for(const p of playerInputs){
    if(!["GK","DEF","MID","FWD"].includes(String(p.position)))failures.push("INVALID_FANTASY_POSITION")
    const rs=p.rates
    if(!Array.isArray(rs)||rs.length<12||
       rs.some((v,i)=>i<4&&(!Number.isFinite(Number(v))||Number(v)<0)))failures.push("INVALID_PLAYER_ATTACK_RATE")
  }
  if(roleShares.length){
    const grouped=new Map()
    for(const x of roleShares){
      const player=players.get(Number(x.player_id))
      if(!player){failures.push("MISSING_ROLE_PLAYER");continue}
      const team=Number(player.club_id)
      if(!grouped.has(team))grouped.set(team,[])
      grouped.get(team).push(x)
      for(const field of ["team_goal_share","team_assist_share"]){
        const value=Number(x[field])
        if(!Number.isFinite(value)||value<0||value>1)failures.push("INVALID_"+field)
      }
    }
    for(const [team,group] of grouped){
      const eligible=group.filter(x=>Number(players.get(Number(x.player_id))?.availability)>0)
      if(!eligible.length)continue
      for(const field of ["team_goal_share","team_assist_share"]){
        const sum=eligible.reduce((a,x)=>a+Number(x[field]),0)
        if(Math.abs(sum-1)>.015)failures.push("UNNORMALIZED_"+field+"_"+team)
      }
    }
    if(grouped.size!==18)failures.push("ROLE_TEAM_COVERAGE_NOT_18")
  }else warnings.push("NO_ROLE_SHARE_EVIDENCE")
  return {pass:failures.length===0,failures:[...new Set(failures)],warnings,
    gameweek,teams:teams.size,players:playerInputs.length,matches:matchInputs.length}
}
