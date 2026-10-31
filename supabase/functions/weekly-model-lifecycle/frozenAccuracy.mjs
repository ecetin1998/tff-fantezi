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

export function frozenAccuracyReport({weeks=[],players=[],positions=[],weeklyPositions=[]}={}) {
  const eligible = weeks.filter(w => w.prediction_mode==="live_frozen" &&
    w.status==="closed" && Number.isInteger(Number(w.gameweek)) &&
    Boolean(w.snapshot_at) &&
    Number(w.prediction_count)>0 && Number(w.actual_count)>0);
  const allowed = new Set(eligible.map(w=>Number(w.gameweek)));
  const fallback = new Map(positions.map(p=>[Number(p.id),String(p.position||"UNKNOWN")]));
  const historic = new Map(weeklyPositions.map(p=>[`${Number(p.gameweek)}|${Number(p.player_id)}`,String(p.position||"UNKNOWN")]));
  const groups = new Map(), total=make(), filtered=[];
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
    filtered.push(row);add(total,row);
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
    sample:filtered.length,overall:finish(total),
    per_week:section("week:"),by_position:section("position:"),
    by_minute_bucket:section("minutes:"),
    // Explicitly non-promoting: model selection must be validated against a
    // genuinely later, untouched week; aggregate in-sample accuracy is NOT proof.
    auto_tuning_permitted:false,no_writes:true
  };
}

export const MINUTE_BUCKETS=["00-19","20-49","50-69","70+"];
