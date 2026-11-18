/**
 * P1: strictly ex-ante match outcome calibration for REAL frozen forecasts.
 * No writes, no model coefficient changes, no in-week rolling forecasts.
 * Never promote a goal/CS adjustment on a retrospective Brier score alone.
 */
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
const prob=v=>numeric(v)&&Number(v)>=0&&Number(v)<=1?Number(v):null
const time=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:null}
const round=(v,n=4)=>Math.round(v*10**n)/10**n
// Descriptive 95% Wilson interval for the observed event frequency.
// This is not a prospective holdout, a model-weight gate or a correction for
// correlated/selected match outcomes.
const wilson95=(hits,n)=>{
 if(!n)return null
 const z=1.96,z2=z*z,p=hits/n,den=1+z2/n
 const mid=(p+z2/(2*n))/den
 const half=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den
 return {lower:round(Math.max(0,mid-half)),upper:round(Math.min(1,mid+half))}
}
const key=(a,b)=>String(a)+':'+String(b)
// Poisson is a reference score for goal-rate calibration; the production
// match simulator may use a different distribution (e.g. NB2).
const goalRate=v=>numeric(v)&&Number(v)>=0&&Number(v)<=10?Number(v):null
const poissonNll=(goals,lambda)=>{
 let logFact=0
 for(let n=2;n<=goals;n++)logFact+=Math.log(n)
 return lambda-goals*Math.log(Math.max(1e-9,lambda))+logFact
}
const facts=(match)=>{
 const home=Number(match.home_goals),away=Number(match.away_goals)
 if(!numeric(match.home_goals)||!numeric(match.away_goals)||
 !Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)return null
 const status=String(match.match_status||'').trim()
 const closure=String(match.fantasy_closure||'').trim()
 if(!['Bitti','FT','FINISHED'].includes(status)||!['KAPANDI','closed'].includes(closure))return null
 return {homeGoals:home,awayGoals:away,homeWin:Number(home>away),draw:Number(home===away),awayWin:Number(home<away),
   homeCs:Number(away===0),awayCs:Number(home===0),
   btts:Number(home>0&&away>0),over25:Number(home+away>=3)}
}
function blank(){return {n:0,goalN:0,homeGoalPred:0,awayGoalPred:0,homeGoalActual:0,awayGoalActual:0,homeGoalAbs:0,awayGoalAbs:0,goalPoissonNll:0,
 resultBrier:0,homeCsBrier:0,awayCsBrier:0,bttsBrier:0,over25Brier:0,
  homeCsPred:0,homeCsActual:0,awayCsPred:0,awayCsActual:0,
  bttsPred:0,bttsActual:0,over25Pred:0,over25Actual:0}}
function view(s){return {
 matches:s.n, result_brier:s.n?round(s.resultBrier/s.n):null,
 goals:{
  samples:s.goalN,
  home:{predicted:s.goalN?round(s.homeGoalPred/s.goalN):null,observed:s.goalN?round(s.homeGoalActual/s.goalN):null,mae:s.goalN?round(s.homeGoalAbs/s.goalN):null},
  away:{predicted:s.goalN?round(s.awayGoalPred/s.goalN):null,observed:s.goalN?round(s.awayGoalActual/s.goalN):null,mae:s.goalN?round(s.awayGoalAbs/s.goalN):null},
  poisson_reference_nll:s.goalN?round(s.goalPoissonNll/s.goalN):null
 },
 home_cs_brier:s.n?round(s.homeCsBrier/s.n):null,
 away_cs_brier:s.n?round(s.awayCsBrier/s.n):null,
 btts_brier:s.n?round(s.bttsBrier/s.n):null,
 over25_brier:s.n?round(s.over25Brier/s.n):null,
 home_cs:{predicted:s.n?round(s.homeCsPred/s.n):null,observed:s.n?round(s.homeCsActual/s.n):null,observed_ci95:wilson95(s.homeCsActual,s.n)},
 away_cs:{predicted:s.n?round(s.awayCsPred/s.n):null,observed:s.n?round(s.awayCsActual/s.n):null,observed_ci95:wilson95(s.awayCsActual,s.n)},
 btts:{predicted:s.n?round(s.bttsPred/s.n):null,observed:s.n?round(s.bttsActual/s.n):null,observed_ci95:wilson95(s.bttsActual,s.n)},
 over25:{predicted:s.n?round(s.over25Pred/s.n):null,observed:s.n?round(s.over25Actual/s.n):null,observed_ci95:wilson95(s.over25Actual,s.n)},
}}
function add(s,p,f,goalRates=null){
 if(goalRates){
  s.goalN++
  s.homeGoalPred+=goalRates.home
  s.awayGoalPred+=goalRates.away
  s.homeGoalActual+=f.homeGoals
  s.awayGoalActual+=f.awayGoals
  s.homeGoalAbs+=Math.abs(goalRates.home-f.homeGoals)
  s.awayGoalAbs+=Math.abs(goalRates.away-f.awayGoals)
  s.goalPoissonNll+=(poissonNll(f.homeGoals,goalRates.home)+poissonNll(f.awayGoals,goalRates.away))/2
 }
 const sq=(x,y)=>(x-y)**2
 s.n++
 s.resultBrier+=(sq(p.h,f.homeWin)+sq(p.d,f.draw)+sq(p.a,f.awayWin))/3
 s.homeCsBrier+=sq(p.hcs,f.homeCs)
 s.awayCsBrier+=sq(p.acs,f.awayCs)
 s.bttsBrier+=sq(p.btts,f.btts)
 s.over25Brier+=sq(p.over25,f.over25)
 for(const [k,v] of [['homeCs','hcs'],['awayCs','acs'],['btts','btts'],['over25','over25']]){
   s[k+'Pred']+=p[v];s[k+'Actual']+=f[k]
 }
}
export function frozenMatchCalibration({weeks=[],forecasts=[],actuals=[]}={}){
 const eligible=new Map(),excludedWeeks=[]
 for(const w of weeks){
   const week=Number(w.gameweek),snap=time(w.snapshot_at)
   if(!Number.isInteger(week)||w.status!=='closed'||w.prediction_mode!=='live_frozen'||
     !w.run_id||snap===null){excludedWeeks.push(w.gameweek);continue}
   const recent=actuals.filter(a=>Number(a.gameweek)===week).map(a=>time(a.kickoff_at)).filter(Number.isFinite)
   if(!recent.length||snap>=Math.min(...recent)){excludedWeeks.push(w.gameweek);continue}
   eligible.set(String(w.run_id),{week,snap,runId:String(w.run_id)})
 }
 const actualMap=new Map(),dupeActual=new Set()
 for(const a of actuals){
   const k=key(a.gameweek,a.match_id)
   if(actualMap.has(k))dupeActual.add(k)
   actualMap.set(k,a)
 }
 const forecastMap=new Map(),dupeForecast=new Set()
 for(const p of forecasts){
   const k=key(p.run_id,p.match_id)
   if(forecastMap.has(k))dupeForecast.add(k)
   forecastMap.set(k,p)
 }
 const total=blank(),byWeek=new Map(),seen=new Set()
 let excludedMatches=0
 for(const p of forecasts){
   const record=eligible.get(String(p.run_id))
   if(!record)continue
   const k=key(record.week,p.match_id),fp=key(p.run_id,p.match_id)
   if(seen.has(fp))continue
   seen.add(fp)
   const a=actualMap.get(k),out=a&&facts(a)
   const when=time(a?.kickoff_at)
   const probabilities={
     h:prob(p.home_win_probability),d:prob(p.draw_probability),a:prob(p.away_win_probability),
     hcs:prob(p.home_cs_probability),acs:prob(p.away_cs_probability),
     btts:prob(p.btts_probability),over25:prob(p.over25_probability)
   }
   if(dupeActual.has(k)||dupeForecast.has(fp)||!out||when===null||record.snap>=when||
     Object.values(probabilities).some(v=>v===null)||
     Math.abs(probabilities.h+probabilities.d+probabilities.a-1)>.02){
     excludedMatches++;continue
   }
   if(!byWeek.has(record.week))byWeek.set(record.week,blank())
   const homeRate=goalRate(p.home_xg),awayRate=goalRate(p.away_xg)
   const rates=homeRate!==null&&awayRate!==null?{home:homeRate,away:awayRate}:null
   add(total,probabilities,out,rates)
   add(byWeek.get(record.week),probabilities,out,rates)
 }
 const overall=view(total)
 const gap=overall.over25.predicted===null?null:round(overall.over25.observed-overall.over25.predicted)
 const over25ci=overall.over25.observed_ci95
 const over25OutsideCI=total.n>=30&&over25ci!==null&&
   (overall.over25.predicted<over25ci.lower||overall.over25.predicted>over25ci.upper)
 return {
   mode:'read_only',auto_promote:false,prediction_mode:'live_frozen',
   overall,
   weeks:[...byWeek.entries()].sort(([a],[b])=>a-b).map(([week,s])=>({gameweek:week,...view(s)})),
   excluded_weeks:excludedWeeks,excluded_matches:excludedMatches,
   over25_gap:gap,over25_review:total.n>=30&&gap!==null&&Math.abs(gap)>=.10,
   over25_outside_observed_ci95:over25OutsideCI,
   caution:'Goal-rate Poisson NLL is a reference diagnostic, not the production NB2 model log score. Wilson intervals describe selected historical observations, not an independent holdout. No automatic weight update.'
 }
}
