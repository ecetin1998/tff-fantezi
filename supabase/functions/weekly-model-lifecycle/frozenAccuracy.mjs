/**
 * Evaluation of immutable, pre-kickoff forecasts against subsequently
 * VERIFIED results. Pure and read-only: never re-estimates past predictions.
 * Historical player positions come from the independently archived weekly
 * scoring ledger if present, falling back to scout_players otherwise.
 */
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const num = value => Number(value);
const round = value => value === null ? null : Math.round(value * 10000) / 10000;
const minuteBucket = mins => mins < 20 ? "00-19" : mins < 50 ? "20-49" : mins < 70 ? "50-69" : "70+";
const make = () => ({n:0,fpSum:0,fpAbs:0,fpSq:0,minuteN:0,minuteSum:0,minuteAbs:0,minuteSq:0,
  p6N:0,p6Pred:0,p6Actual:0,p6Brier:0});

const makeMinutes=()=>({verified:0,forecast_30_plus:0,actual_30_plus:0,
  actual_60_plus:0,forecast_30_and_actual_30:0,
  forecast_under_30_actual_30_plus:0,forecast_under_30_actual_60_plus:0,
  forecast_30_actual_under_30:0,forecast_60_actual_under_30:0,
  forecast_30_confirmed_dnp:0,forecast_30_reconstructed_zero_excluded:0});
const finishMinutes=m=>({
  ...m,
  active_30_precision:m.forecast_30_plus?
    round(m.forecast_30_and_actual_30/m.forecast_30_plus):null,
  active_30_recall:m.actual_30_plus?
    round(m.forecast_30_and_actual_30/m.actual_30_plus):null,
  long_stint_60_recall:m.actual_60_plus?
    round((m.actual_60_plus-m.forecast_under_30_actual_60_plus)/m.actual_60_plus):null
});

function add(group,row) {
  if(finite(row.predicted_xfp) && finite(row.actual_points)){
    const error=num(row.predicted_xfp)-num(row.actual_points);
    group.n++; group.fpSum+=error; group.fpAbs+=Math.abs(error); group.fpSq+=error*error;
  }
  if(finite(row.predicted_minutes)&&finite(row.actual_minutes)){
    const error=num(row.predicted_minutes)-num(row.actual_minutes);
    group.minuteN++;group.minuteSum+=error;group.minuteAbs+=Math.abs(error);group.minuteSq+=error*error;
  }
  if(finite(row.six_plus_probability)&&finite(row.actual_points)){
    const p=num(row.six_plus_probability);
    if(p>=0&&p<=1){
      const actual=num(row.actual_points)>=6?1:0;
      group.p6N++;group.p6Pred+=p;group.p6Actual+=actual;group.p6Brier+=(p-actual)**2;
    }
  }
}

function finish(group) {
  const n=group.n,m=group.minuteN,k=group.p6N;
  return {
    n,fp_mae:n?round(group.fpAbs/n):null,fp_bias:n?round(group.fpSum/n):null,
    fp_rmse:n?round(Math.sqrt(group.fpSq/n)):null,
    minute_n:m,minute_mae:m?round(group.minuteAbs/m):null,
    minute_bias:m?round(group.minuteSum/m):null,
    minute_rmse:m?round(Math.sqrt(group.minuteSq/m)):null,
    six_plus_n:k,six_plus_forecast:k?round(group.p6Pred/k):null,
    six_plus_observed:k?round(group.p6Actual/k):null,
    six_plus_brier:k?round(group.p6Brier/k):null
  };
}

export function frozenAccuracyReport({weeks=[],players=[],positions=[],weeklyPositions=[],fixtures=[]}={}) {
  const earliest=new Map();
  for(const fixture of fixtures){
    const week=Number(fixture.gameweek),kickoff=new Date(fixture.kickoff_at||"").getTime();
    if(!Number.isInteger(week)||!Number.isFinite(kickoff))continue;
    earliest.set(week,Math.min(earliest.get(week)??Infinity,kickoff));
  }
  const eligible = weeks.filter(w => w.prediction_mode==="live_frozen" &&
    w.status==="closed" && Number.isInteger(Number(w.gameweek)) &&
    Boolean(w.snapshot_at) &&
    Number(w.prediction_count)>0 && Number(w.actual_count)>0 &&
    earliest.has(Number(w.gameweek)) &&
    Number.isFinite(new Date(w.snapshot_at).getTime()) &&
    new Date(w.snapshot_at).getTime()<earliest.get(Number(w.gameweek)));
  const allowed = new Set(eligible.map(w=>Number(w.gameweek)));
  const fallback = new Map(positions.map(p=>[Number(p.id),String(p.position||"UNKNOWN")]));
  const historic = new Map(weeklyPositions.map(p=>[`${Number(p.gameweek)}|${Number(p.player_id)}`,String(p.position||"UNKNOWN")]));
  // The week-close RPC historically fills absent player-result rows with 0/0.
  // Never silently treat those imputed zeroes as verified negative examples.
  // Independently reconstructed event rows are useful when minutes > 0,
  // but their zero-minute rows DO NOT prove a bench / non-participation.
  const evidence = new Map();
  for(const row of weeklyPositions){
    const key=`${Number(row.gameweek)}|${Number(row.player_id)}`;
    const prev=evidence.get(key);
    const item={
      source_kind:String(row.source_kind||"unknown"),
      is_final:row.is_final===true,
      minutes:finite(row.minutes)?num(row.minutes):null,
      points:finite(row.points)?num(row.points):null
    };
    if(!prev)evidence.set(key,[item]);
    else prev.push(item);
  }
  const groups = new Map(), total=make(), filtered=[];
  const minutesByPosition=new Map(),minutesByWeek=new Map();
  const recordMinutes=(group,row,verifiedZero)=>{
    const pred=num(row.predicted_minutes),actual=num(row.actual_minutes);
    group.verified++;
    if(pred>=30)group.forecast_30_plus++;
    if(actual>=30)group.actual_30_plus++;
    if(actual>=60)group.actual_60_plus++;
    if(pred>=30&&actual>=30)group.forecast_30_and_actual_30++;
    if(pred<30&&actual>=30)group.forecast_under_30_actual_30_plus++;
    if(pred<30&&actual>=60)group.forecast_under_30_actual_60_plus++;
    if(pred>=30&&actual<30)group.forecast_30_actual_under_30++;
    if(pred>=60&&actual<30)group.forecast_60_actual_under_30++;
    if(pred>=30&&actual===0&&verifiedZero)group.forecast_30_confirmed_dnp++;
  };
  const cohorts=new Map();
  const counts={
    imputed_zero_without_source:0,inferred_zero_from_events:0,mismatched_actual_source:0,
    independently_reconstructed_played:0,confirmed_source_zero:0,
    true_zero_zero:0,low_attention_zero_zero:0,
    ex_ante_predicted_active:0,actually_played:0,missed_surprise_starter:0,
    predicted_active_absent:0,confirmed_predicted_active_absent:0,
    actionable_all:0,actionable_eligible:0,excluded_uncertain_active:0
  };
  const cohort=(name,row)=>{
    if(!cohorts.has(name))cohorts.set(name,make());
    add(cohorts.get(name),row);
  };
  function track(key,row) {
    if(!groups.has(key))groups.set(key,make());
    add(groups.get(key),row);
  }
  for(const row of players){
    const gw=Number(row.gameweek),id=Number(row.player_id);
    if(!allowed.has(gw) || row.prediction_mode!=="live_frozen" ||
       !finite(row.predicted_xfp) || !finite(row.actual_points))continue;
    const position=historic.get(`${gw}|${id}`)||fallback.get(id)||"UNKNOWN";
    const minBucket=finite(row.predicted_minutes)?minuteBucket(num(row.predicted_minutes)):"UNKNOWN";
    const pred=finite(row.predicted_minutes)?num(row.predicted_minutes):null;
    const actual=finite(row.actual_minutes)?num(row.actual_minutes):null;
    const raw=evidence.get(`${gw}|${id}`)||[];
    const hasFinal=raw.length>0&&raw.every(e=>e.is_final);
    const matched=hasFinal&&raw.every(e=>e.minutes!==null&&e.points!==null)&&
      actual!==null&&Math.abs(raw.reduce((sum,e)=>sum+e.minutes,0)-actual)<.05&&
      Math.abs(raw.reduce((sum,e)=>sum+e.points,0)-num(row.actual_points))<.05;
    const verifiedZero=matched&&raw.every(e=>
      e.source_kind==="fresh_closed_actual"&&e.minutes===0&&e.points===0);
    const sourcePlayed=matched&&raw.some(e=>e.minutes>0);
    // An independently-calculated 0-minute row may have been filled in by an
    // inference step. Do not use its silence as evidence that the coach
    // actually benched the player.
    const inferredZero=matched&&actual===0&&!verifiedZero;
    const noSource=raw.length===0;
    if(raw.length>0&&!matched)counts.mismatched_actual_source++;
    const trusted=matched&&(sourcePlayed||verifiedZero);
    if(trusted&&pred!==null&&actual!==null){
      if(!minutesByPosition.has(position))minutesByPosition.set(position,makeMinutes());
      if(!minutesByWeek.has(gw))minutesByWeek.set(gw,makeMinutes());
      recordMinutes(minutesByPosition.get(position),row,verifiedZero);
      recordMinutes(minutesByWeek.get(gw),row,verifiedZero);
    }else if(pred!==null&&pred>=30&&inferredZero){
      if(!minutesByPosition.has(position))minutesByPosition.set(position,makeMinutes());
      if(!minutesByWeek.has(gw))minutesByWeek.set(gw,makeMinutes());
      minutesByPosition.get(position).forecast_30_reconstructed_zero_excluded++;
      minutesByWeek.get(gw).forecast_30_reconstructed_zero_excluded++;
    }
    const predictedActive=pred!==null&&pred>=30;
    const played=actual!==null&&actual>0;
    const actionable=predictedActive||played;
    if(actual===0&&num(row.actual_points)===0){
      counts.true_zero_zero++;
      if(pred!==null&&pred<15)counts.low_attention_zero_zero++;
      if(noSource)counts.imputed_zero_without_source++;
      else if(inferredZero)counts.inferred_zero_from_events++;
      else if(verifiedZero)counts.confirmed_source_zero++;
    }
    if(sourcePlayed&&raw.some(e=>e.source_kind==="independently_calculated_source_events"))
      counts.independently_reconstructed_played++;
    if(predictedActive)counts.ex_ante_predicted_active++;
    if(played)counts.actually_played++;
    if(pred!==null&&pred<30&&actual!==null&&actual>=60)counts.missed_surprise_starter++;
    if(predictedActive&&actual===0){
      counts.predicted_active_absent++;
      if(verifiedZero)counts.confirmed_predicted_active_absent++;
    }
    if(actionable){
      counts.actionable_all++;
      if(trusted)counts.actionable_eligible++;
      else counts.excluded_uncertain_active++;
    }
    filtered.push(row);add(total,row);
    // Keep the old all-player metric as a COMPARISON only. It is NOT the
    // learning objective: many easy 0/0 rows can dominate it.
    cohort("legacy_all",row);
    if(actionable)cohort("actionable_including_uncertain",row);
    if(predictedActive)cohort("ex_ante_all",row);
    if(trusted){
      cohort("verified_source",row);
      if(actionable){
        cohort("actionable",row);
        track(`learning:week:${gw}`,row);
        track(`learning:position:${position}`,row);
        track(`learning:week:${gw}:position:${position}`,row);
      }
      if(predictedActive)cohort("ex_ante",row);
      if(played)cohort("played",row);
      if(played&&predictedActive)cohort("correctly_expected_to_play",row);
      if(played&&pred!==null&&pred<30)cohort("surprise_played",row);
      if(actual!==null&&actual>=60&&pred!==null&&pred<30)
        cohort("surprise_starters",row);
      if(predictedActive&&actual===0&&verifiedZero)
        cohort("confirmed_unexpected_absences",row);
    }
    if(pred!==null&&pred<15&&actual===0&&num(row.actual_points)===0)
      cohort("trivial_zero_zero_monitor_only",row);
    track(`week:${gw}`,row);
    track(`position:${position}`,row);
    track(`week:${gw}:position:${position}`,row);
    track(`minutes:${minBucket}`,row);
    track(`week:${gw}:minutes:${minBucket}`,row);
  }
  const section=(prefix)=>Object.fromEntries(
    [...groups.entries()].filter(([key])=>key.startsWith(prefix))
      .sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,finish(v)]));
  const weeksOut = eligible.map(w=>Number(w.gameweek)).sort((a,b)=>a-b);
  return {
    ok:true,source:"immutable_pre_kickoff_live_frozen",
    closed_weeks:weeksOut,excluded_open_weeks:weeks.filter(w=>w.status!=="closed").map(w=>Number(w.gameweek)),
    excluded_invalid_snapshots:weeks.filter(w=>w.status==="closed"&&w.prediction_mode==="live_frozen"&&!allowed.has(Number(w.gameweek))).map(w=>Number(w.gameweek)),
    sample:filtered.length,overall:finish(total),
    per_week:section("week:"),by_position:section("position:"),
    by_minute_bucket:section("minutes:"),
    // PRIMARY learning score uses ONLY pre-match player-selection criteria.
    // Avoid evaluating only players who happened to play: that would leak
    // realized outcomes into who qualifies for the model-selection target.
    primary_learning_cohort:"ex_ante",
    primary_learning_threshold_minutes:30,
    learning_by_week:section("learning:week:"),
    learning_by_position:section("learning:position:"),
    minutes_decision_by_week:Object.fromEntries([...minutesByWeek.entries()]
      .sort(([a],[b])=>a-b).map(([k,v])=>[k,finishMinutes(v)])),
    minutes_decision_by_position:Object.fromEntries([...minutesByPosition.entries()]
      .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,finishMinutes(v)])),
    learning_cohorts:Object.fromEntries([...cohorts.entries()].map(([k,v])=>[k,finish(v)])),
    evidence_quality:counts,
    learning_guardrails:{
      selection:"pre_kickoff_expected_minutes_ge_30",
      objective:"ex_ante.fp_mae, ex_ante.six_plus_brier, surprise_starters_count",
      active_union_is_diagnostic:true,
      historical_0_0_is_not_a_training_success:true,
      zero_without_source_is_unverified:true,
      reconstructed_zero_minutes_is_unverified:true,
      minimum_independent_holdout_weeks:2,
      can_change_weights_automatically:false
    },
    // Explicitly non-promoting: model selection must be validated against a
    // genuinely later, untouched week; aggregate in-sample accuracy is NOT proof.
    auto_tuning_permitted:false,no_writes:true
  };
}

export const MINUTE_BUCKETS=["00-19","20-49","50-69","70+"];
