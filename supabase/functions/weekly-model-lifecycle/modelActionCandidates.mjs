// Diagnostic-only interventions. Never alter frozen predictions or current live model.
// A closed, pre-kickoff forecast can be evaluated using ONLY evidence available at its freeze time.
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>Number(v);
const round=(v,d=3)=>v===null?null:Number(v.toFixed(d));
const make=()=>({n:0,baselineAbs:0,trialAbs:0,zeroSensitivityN:0,zeroBaselineAbs:0,zeroTrialAbs:0});
const finish=m=>({
  n:m.n,baseline_mae:m.n?round(m.baselineAbs/m.n):null,
  trial_mae:m.n?round(m.trialAbs/m.n):null,
  improvement:m.n?round((m.baselineAbs-m.trialAbs)/m.n):null,
  unverified_zero:m.zeroSensitivityN,
  // Worst-case sensitivity only, NOT an assertion that an inferred DNP was real.
  hypothetical_zero_as_real_improvement:
    m.n+m.zeroSensitivityN?round((m.baselineAbs+m.zeroBaselineAbs-m.trialAbs-m.zeroTrialAbs)/(m.n+m.zeroSensitivityN)):null
});
const intervalScore=(lo,hi,y,alpha=.35)=>(hi-lo)+(2/alpha)*Math.max(0,lo-y)+(2/alpha)*Math.max(0,y-hi);

export function evaluateModelActionCandidates({weeks=[],players=[],weeklyActuals=[],availability=[],fixtures=[]}={}){
  const weekInfo=new Map(),kickoff=new Map();
  for(const fx of fixtures){
    const week=Number(fx.gameweek),ms=Date.parse(fx.kickoff_at||'');
    if(Number.isInteger(week)&&Number.isFinite(ms))kickoff.set(week,Math.min(kickoff.get(week)??Infinity,ms));
  }
  for(const w of weeks){
    const week=Number(w.gameweek),snapshot=Date.parse(w.snapshot_at||'');
    if(w.status==='closed'&&w.prediction_mode==='live_frozen'&&w.run_id&&
       Number(w.actual_count)>0&&Number(w.prediction_count)>0&&
       Number.isFinite(snapshot)&&snapshot<(kickoff.get(week)??-Infinity))
      weekInfo.set(week,{run_id:String(w.run_id),snapshot});
  }
  const source=new Map();
  for(const row of weeklyActuals){
    const key=Number(row.gameweek)+'|'+Number(row.player_id);
    // Avoid pretending duplicated same-game rows are independently confirmed.
    if(source.has(key)){source.set(key,null);continue;}
    source.set(key,row);
  }
  const avail=new Map(availability.map(a=>[String(a.run_id)+'|'+Number(a.player_id),a]));
  const perWeek=new Map();
  const stat=w=>{
    if(!perWeek.has(w))perWeek.set(w,{minute:make(),band:make(),bandHit:0,bandHitTrial:0});
    return perWeek.get(w);
  };
  for(const p of players){
    const week=Number(p.gameweek),info=weekInfo.get(week);
    if(!info||p.prediction_mode!=='live_frozen'||!finite(p.predicted_minutes)||
      !finite(p.actual_minutes)||!finite(p.predicted_xfp)||!finite(p.actual_points))continue;
    const current=source.get(week+'|'+Number(p.player_id));
    const matched=current?.is_final===true&&finite(current.minutes)&&finite(current.points)&&
      Math.abs(num(current.minutes)-num(p.actual_minutes))<.05&&
      Math.abs(num(current.points)-num(p.actual_points))<.05;
    const trusted=matched&&(num(current.minutes)>0||
      (current.source_kind==='fresh_closed_actual'&&num(current.minutes)===0&&num(current.points)===0));
    const s=stat(week),prediction=num(p.predicted_minutes),actual=num(p.actual_minutes);
    // Test the earlier -1 lower-tail intervention using proper interval scoring.
    // P25-P90 is a 65%-mass interval, not an automatic 90% target.
    if(trusted&&prediction>=35&&finite(p.p25)&&finite(p.p90)&&num(p.p25)<=num(p.p90)){
      const lo=num(p.p25),hi=num(p.p90),y=num(p.actual_points);
      s.band.n++;
      s.band.baselineAbs+=intervalScore(lo,hi,y);
      s.band.trialAbs+=intervalScore(lo-1,hi,y);
      if(y>=lo&&y<=hi)s.bandHit++;
      if(y>=lo-1&&y<=hi)s.bandHitTrial++;
    }
    const prior=source.get((week-1)+'|'+Number(p.player_id));
    const priorTime=prior?.source_updated_at?Date.parse(prior.source_updated_at):NaN;
    const a=avail.get(info.run_id+'|'+Number(p.player_id));
    if(prior?.is_final!==true||!finite(prior.minutes)||num(prior.minutes)<60||
      !Number.isFinite(priorTime)||priorTime>info.snapshot||
      !finite(a?.availability_probability)||num(a.availability_probability)<.8||
      prediction>=60)continue;
    // Shadow candidate, explicitly not a live adjustment.
    const trial=Math.max(prediction,Math.min(55,num(prior.minutes)*.65));
    if(trusted){
      s.minute.n++;
      s.minute.baselineAbs+=Math.abs(prediction-actual);
      s.minute.trialAbs+=Math.abs(trial-actual);
    }else if(matched&&actual===0&&num(p.actual_points)===0){
      s.minute.zeroSensitivityN++;
      s.minute.zeroBaselineAbs+=Math.abs(prediction);
      s.minute.zeroTrialAbs+=Math.abs(trial);
    }
  }
  return {
    write_mode:'read_only',auto_promote:false,
    interval_target:'P25-P90 central mass 65%, with possible discrete quantile ties',
    candidate_minutes:'prior_week_final_60plus_available_before_snapshot_and_availability_ge_0.8',
    candidate_band:'predicted_minutes_ge_35_lower_p25_minus_1_interval_score_alpha_0.35',
    cohort_policy:'verified_actuals_only; unresolved 0/0 hypothetical sensitivity separately',
    per_week:[...perWeek.entries()].sort(([a],[b])=>a-b).map(([gameweek,s])=>({
      gameweek,
      minutes:finish(s.minute),
      band:{...finish(s.band),baseline_coverage:s.band.n?round(s.bandHit/s.band.n):null,
        trial_coverage:s.band.n?round(s.bandHitTrial/s.band.n):null}
    }))
  };
}
