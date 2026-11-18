/**
 * P0: Source-gated ex-ante three-state playing time audit.
 * Does not train, adjust, publish or rewrite any frozen prediction.
 *
 * Starter = independently verified complete first XI.
 * Substitute = independently verified entered from bench.
 * Unused = separately confirmed explicit DNP. An inferred 0/0 is UNKNOWN.
 * Use the archived FROZEN forecast for each week, never a rolling update.
 */
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const num=v=>Number(v);
const stamp=v=>{const t=Date.parse(v||"");return Number.isFinite(t)?t:null};
const key=(...values)=>values.map(v=>String(v)).join(":");
const round=v=>v===null?null:Math.round(v*10000)/10000;
const source=row=>typeof row?.source_url==="string"&&/^https:\/\//.test(row.source_url);
const proper=p=>finite(p?.xi_probability)&&finite(p?.appearance_probability)&&finite(p?.x_minutes)&&
  num(p.xi_probability)>=0&&num(p.xi_probability)<=1&&
  num(p.appearance_probability)>=num(p.xi_probability)&&num(p.appearance_probability)<=1&&
  num(p.x_minutes)>=0&&num(p.x_minutes)<=180;
const freshActual=row=>row?.is_final===true&&finite(row.minutes)&&num(row.minutes)>0&&finite(row.points);
function stat(){return {xiN:0,xiLoss:0,sourceXI:0,stateN:0,stateLoss:0,starterState:0,subState:0,
  unusedState:0,unverifiedUnused:0,unmatchedActual:0,exAnteN:0,exAnteMinAbs:0,
  verifiedActiveN:0,verifiedActiveMinAbs:0,startersMinuteN:0,startersMinuteAbs:0,
  subsMinuteN:0,subsMinuteAbs:0,actual30:0,actual60:0,forecast30:0,forecast60:0,
  hit30:0,hit60:0,missed60:0,missingPredictions:0,incompleteXI:0,invalidPredictions:0};}
function view(s){return {
  xi_n:s.xiN,xi_brier:s.xiN?round(s.xiLoss/s.xiN):null,complete_verified_xi_teams:s.sourceXI,
  known_playing_state_n:s.stateN,
  // Biased when unused outcomes are unverified; NEVER use for promotion.
  observed_state_brier_diagnostic:s.stateN?round(s.stateLoss/s.stateN):null,
  confirmed_starters:s.starterState,confirmed_substitutes:s.subState,confirmed_unused:s.unusedState,
  unknown_unused_excluded:s.unverifiedUnused,unmatched_played_evidence:s.unmatchedActual,
  ex_ante_30_minute_sample:s.exAnteN,
  ex_ante_30_minute_mae:s.exAnteN?round(s.exAnteMinAbs/s.exAnteN):null,
  verified_active_n:s.verifiedActiveN,
  verified_active_minute_mae:s.verifiedActiveN?round(s.verifiedActiveMinAbs/s.verifiedActiveN):null,
  starter_minutes_n:s.startersMinuteN,starter_minutes_mae:s.startersMinuteN?round(s.startersMinuteAbs/s.startersMinuteN):null,
  substitute_minutes_n:s.subsMinuteN,substitute_minutes_mae:s.subsMinuteN?round(s.subsMinuteAbs/s.subsMinuteN):null,
  actual_30_plus:s.actual30,actual_60_plus:s.actual60,
  forecast_30_plus:s.forecast30,forecast_60_plus:s.forecast60,
  recall_30_plus:s.actual30?round(s.hit30/s.actual30):null,
  recall_60_plus:s.actual60?round(s.hit60/s.actual60):null,
  missed_60_plus_forecast_under_30:s.missed60,
  missing_frozen_predictions:s.missingPredictions,incomplete_or_contradictory_xi:s.incompleteXI,
  invalid_frozen_predictions:s.invalidPredictions
}}
export function minuteStateAudit({weeks=[],fixtures=[],players=[],projections=[],evidence=[],actuals=[]}={}){
  const byWeek=new Map(),byRun=new Map(),cutoff=new Map(),fixtureById=new Map();
  for(const f of fixtures){
    const week=num(f.gameweek),date=stamp(f.kickoff_at);
    if(!Number.isInteger(week)||date===null||!Number.isInteger(num(f.match_id)))continue;
    cutoff.set(week,Math.min(date,cutoff.get(week)??Infinity));
    fixtureById.set(key(week,f.match_id),f);
  }
  const skipped=[];
  for(const w of weeks){
    const week=num(w.gameweek),frozen=stamp(w.snapshot_at),first=cutoff.get(week);
    if(w.status!=="closed"||w.prediction_mode!=="live_frozen"||!w.run_id||
      !Number.isInteger(week)||!Number.isFinite(first)||frozen===null||frozen>=first||
      !Number.isInteger(num(w.training_through_gameweek))||
      num(w.training_through_gameweek)>=week){skipped.push(week);continue;}
    byWeek.set(week,w);byRun.set(String(w.run_id),week);
  }
  const roster=new Map(players.map(p=>[num(p.id),p]));
  const forecast=new Map(),duplicates=new Set();
  for(const p of projections){
    const week=byRun.get(String(p.run_id));
    if(week===undefined)continue;
    const k=key(week,p.player_id);
    if(forecast.has(k))duplicates.add(k);
    forecast.set(k,p);
  }
  const actual=new Map(),actualDuplicates=new Set();
  for(const a of actuals){
    if(!byWeek.has(num(a.gameweek)))continue;
    const k=key(a.gameweek,a.player_id);
    if(actual.has(k))actualDuplicates.add(k);
    actual.set(k,a);
  }
  const groups=new Map(),evidenceByPlayer=new Map();
  for(const row of evidence){
    const week=num(row.gameweek),fix=fixtureById.get(key(week,row.match_id)),p=roster.get(num(row.player_id));
    if(!byWeek.has(week)||!fix||!p||![num(fix.home_team_id),num(fix.away_team_id)].includes(num(p.team_id)))continue;
    const rosterKey=key(week,row.player_id);
    if(!evidenceByPlayer.has(rosterKey))evidenceByPlayer.set(rosterKey,[]);
    evidenceByPlayer.get(rosterKey).push(row);
    if(row.started!==true||row.verified_first_11!==true)continue;
    const groupKey=key(week,row.match_id,p.team_id);
    if(!groups.has(groupKey))groups.set(groupKey,{week,team:num(p.team_id),ids:new Set(),invalid:false});
    const g=groups.get(groupKey);
    if(!source(row)||!finite(row.minutes)||num(row.minutes)<=0||
      !Number.isInteger(num(row.player_id))||g.ids.has(num(row.player_id)))g.invalid=true;
    g.ids.add(num(row.player_id));
  }
  const byPos=new Map(),byWeekStat=new Map(),total=stat();
  const statFor=(map,keyString)=>{if(!map.has(keyString))map.set(keyString,stat());return map.get(keyString);};
  for(const group of groups.values()){
    const members=[...group.ids];
    const all=[...roster.values()].filter(p=>num(p.team_id)===group.team);
    if(group.invalid||members.length!==11||
      members.filter(id=>roster.get(id)?.position==="GK").length!==1||
      !members.every(id=>all.some(p=>num(p.id)===id))){
      for(const s of [total,statFor(byWeekStat,group.week)])s.incompleteXI++;
      continue;
    }
    for(const s of [total,statFor(byWeekStat,group.week)])s.sourceXI++;
    for(const player of all){
      const id=num(player.id),k=key(group.week,id),p=forecast.get(k),s=[total,statFor(byWeekStat,group.week),
        statFor(byPos,player.position||"UNKNOWN")];
      if(!p||duplicates.has(k)){for(const x of s)x.missingPredictions++;continue;}
      if(!proper(p)){for(const x of s)x.invalidPredictions++;continue;}
      const started=group.ids.has(id),xi=num(p.xi_probability),app=num(p.appearance_probability),xmins=num(p.x_minutes);
      for(const x of s){x.xiN++;x.xiLoss+=(xi-Number(started))**2;}
      const eventRows=evidenceByPlayer.get(k)||[];
      const stateRows=eventRows.filter(x=>source(x)&&finite(x.minutes)&&num(x.minutes)>0);
      const matching=stateRows.filter(x=>started
        ?x.started===true&&x.verified_first_11===true
        :x.started===false&&x.verified_substitution===true);
      const value=actual.get(k);
      const matched=matching.length===1&&!actualDuplicates.has(k)&&freshActual(value)&&
        Math.abs(num(value.minutes)-num(matching[0].minutes))<.05;
      if(!matched){
        if(stateRows.length||value&&finite(value.minutes)&&num(value.minutes)>0){
          for(const x of s)x.unmatchedActual++;
        }else if(!started){for(const x of s)x.unverifiedUnused++;}
        continue;
      }
      // Source-confirmed starts and substitutions only; other 0/0 outcomes are
      // deliberately excluded from three-state scoring and exposure metrics.
      const probs=[xi,Math.max(0,app-xi),Math.max(0,1-app)];
      const state=started?0:1;
      const loss=probs.reduce((sum,pv,i)=>sum+(pv-Number(i===state))**2,0);
      const y=num(value.minutes),error=Math.abs(xmins-y),forecast30=xmins>=30,forecast60=xmins>=60;
      for(const x of s){
        x.stateN++;x.stateLoss+=loss;
        if(started){x.starterState++;x.startersMinuteN++;x.startersMinuteAbs+=error;}
        else{x.subState++;x.subsMinuteN++;x.subsMinuteAbs+=error;}
        x.verifiedActiveN++;x.verifiedActiveMinAbs+=error;
        if(forecast30){x.exAnteN++;x.exAnteMinAbs+=error;x.forecast30++;}
        if(forecast60)x.forecast60++;
        if(y>=30){x.actual30++;if(forecast30)x.hit30++;}
        if(y>=60){x.actual60++;if(forecast60)x.hit60++;if(!forecast30)x.missed60++;}
      }
    }
  }
  return {ok:true,mode:"read_only",no_writes:true,auto_promote:false,
    evidence_policy:"complete_verified_team_XI;source_verified_bench_entry;positive_minutes_matched_to_final",
    zero_policy:"unconfirmed_zero_is_unknown_never_DNP",
    caveat:"observed_state_brier_diagnostic uses confirmed starters/substitutes only; not proper full three-state Brier without independently verified unused players",
    eligible_weeks:[...byWeek.keys()].sort((a,b)=>a-b),skipped_weeks:skipped,
    overall:view(total),
    by_week:[...byWeekStat.entries()].sort(([a],[b])=>a-b).map(([gameweek,s])=>({gameweek,...view(s)})),
    by_position:Object.fromEntries([...byPos.entries()].map(([pos,s])=>[pos,view(s)]))};
}
