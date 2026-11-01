/**
 * An explicitly bounded, forward-only learning candidate.
 *
 * The training cohort is chosen with PRE-KICKOFF estimates (30+ expected
 * minutes, 2.0 <= xFP < 3.5, FWD). Outcomes MUST come from closed, frozen
 * weeks with independently finalised player points. Missing and reconstructed
 * 0-minute rows are not safe evidence of DNP.
 *
 * This validates DIRECTION with a -0.30 xFP proxy, not a claim that a scorer
 * weight multiplier and a direct -0.30 post-process are equivalent. Live
 * simulations change event allocation, never official scoring.
 */
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const num=v=>Number(v);
const round=v=>Math.round(v*10000)/10000;
export const FORWARD_LEARNING_V1=Object.freeze({
  version:"active-fwd-event-share-v1",
  training_week:7,
  holdout_weeks:[8,9],
  min_minutes:30,lower_xfp:2,upper_xfp:3.5,
  proxy_xfp_offset:-.30,goal_assist_factor:.65,
  min_week_samples:7,min_holdout_mae_gain:.05
});

export function verifyForwardHistory({weeks=[],fixtures=[],forecasts=[],actuals=[],config=FORWARD_LEARNING_V1}={}){
  const targets=[config.training_week,...config.holdout_weeks];
  const starts=new Map();
  for(const fx of fixtures){
    const gw=Number(fx.gameweek),stamp=new Date(fx.kickoff_at||"").getTime();
    if(Number.isInteger(gw)&&Number.isFinite(stamp))
      starts.set(gw,Math.min(starts.get(gw)??Infinity,stamp));
  }
  const snapshotWeeks=new Set(weeks.filter(w=>
    targets.includes(Number(w.gameweek))&&w.status==="closed"&&
    w.prediction_mode==="live_frozen"&&
    Number(w.prediction_count)>0&&Number(w.actual_count)>0&&
    Number.isFinite(new Date(w.snapshot_at||"").getTime())&&
    starts.has(Number(w.gameweek))&&
    new Date(w.snapshot_at).getTime()<starts.get(Number(w.gameweek))
  ).map(w=>Number(w.gameweek)));
  const outcomes=new Map();
  for(const x of actuals){
    if(!x.is_final)continue;
    const key=`${Number(x.gameweek)}|${Number(x.player_id)}`;
    const group=outcomes.get(key)||{n:0,m:0,p:0,final:true,official:true};
    group.n++;
    group.m+=num(x.minutes);
    group.p+=num(x.points);
    group.official=group.official&&x.source_kind==="fresh_closed_actual";
    outcomes.set(key,group);
  }
  const data=new Map(targets.map(gw=>[gw,{n:0,base:0,trial:0}]));
  for(const row of forecasts){
    const week=Number(row.gameweek);
    if(!snapshotWeeks.has(week)||row.prediction_mode!=="live_frozen"||
      !finite(row.predicted_minutes)||num(row.predicted_minutes)<config.min_minutes||
      !finite(row.predicted_xfp)||!finite(row.actual_points)||
      !finite(row.actual_minutes))continue;
    const x=num(row.predicted_xfp);
    if(x<config.lower_xfp||x>=config.upper_xfp)continue;
    const a=outcomes.get(`${week}|${Number(row.player_id)}`);
    if(!a||!a.n||Math.abs(a.m-num(row.actual_minutes))>.001||
      Math.abs(a.p-num(row.actual_points))>.001||
      !(a.m>0||(a.official&&a.m===0&&a.p===0)))continue;
    const o=data.get(week);
    const y=num(row.actual_points);
    o.n++;o.base+=Math.abs(x-y);o.trial+=Math.abs(Math.max(0,x+config.proxy_xfp_offset)-y);
  }
  const byWeek={};
  let pass=snapshotWeeks.size===targets.length;
  for(const gw of targets){
    const row=data.get(gw),gain=row.n?(row.base-row.trial)/row.n:null;
    byWeek[gw]={n:row.n,baseline_mae:row.n?round(row.base/row.n):null,
      proxy_mae:row.n?round(row.trial/row.n):null,mae_gain:gain===null?null:round(gain)};
    if(row.n<config.min_week_samples||gain===null||
      gain<=(gw===config.training_week?0:config.min_holdout_mae_gain))pass=false;
  }
  return {pass,config_version:config.version,training_week:config.training_week,
    holdout_weeks:config.holdout_weeks,by_week:byWeek,
    sample:targets.reduce((sum,w)=>sum+data.get(w).n,0),
    goal_assist_factor:config.goal_assist_factor,
    proxy_xfp_offset:config.proxy_xfp_offset,
    confidence:"limited_small_forward_cohort",auto_promotion:false};
}

export function parseForwardExperiment(row,gameweek){
  if(!row||!["applied","applied_pending_refresh"].includes(String(row.status)))return null;
  let data;
  try{data=JSON.parse(String(row.notes||""));}catch{return null}
  if(data?.version!==FORWARD_LEARNING_V1.version||
    Number(data?.target_gameweek)!==gameweek||
    typeof data?.baseline_run_id!=="string"||
    !/^[a-f0-9-]{36}$/i.test(data.baseline_run_id)||
    Number(data?.goal_assist_factor)!==FORWARD_LEARNING_V1.goal_assist_factor)
    return null;
  return {baselineRunId:data.baseline_run_id,targetGameweek:gameweek,
    factor:FORWARD_LEARNING_V1.goal_assist_factor};
}

export function forwardFeedbackRate(position,baselineXfp,baselineMinutes,enabled,
  config=FORWARD_LEARNING_V1){
  return enabled&&position==="FWD"&&finite(baselineXfp)&&
    num(baselineXfp)>=config.lower_xfp&&num(baselineXfp)<config.upper_xfp&&
    finite(baselineMinutes)&&num(baselineMinutes)>=config.min_minutes
    ?config.goal_assist_factor:1;
}
