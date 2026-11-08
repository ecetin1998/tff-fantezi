// Observational accuracy only: immutable pre-kickoff snapshots, never retrofitted forecasts.
// 0/0 inferred from scoring events is NOT independent confirmation of a DNP.
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const number=value=>Number(value);
const round=(value,digits=3)=>Number(value.toFixed(digits));
const minuteDecision=()=>({verified:0,forecast_30_plus:0,actual_30_plus:0,forecast_30_actual_30:0,surprise_60:0,predicted_30_but_under_30:0});

export function verifiedFrozenWeeklyAccuracy({weeks=[],players=[],weeklyActuals=[],fixtures=[]}={}){
  const kickoffs=new Map();
  for(const f of fixtures){
    const runId=String(f.run_id||''),ms=new Date(f.kickoff_at||'').getTime();
    if(runId&&Number.isFinite(ms))kickoffs.set(runId,Math.min(kickoffs.get(runId)??Infinity,ms));
  }
  const allowed=weeks.filter(w=>{
    const run=String(w.run_id||''),first=kickoffs.get(run),snapshot=new Date(w.snapshot_at||'').getTime();
    return w.status==='closed'&&w.prediction_mode==='live_frozen'&&
      Number(w.prediction_count)>0&&Number(w.actual_count)>0&&
      Number.isFinite(first)&&Number.isFinite(snapshot)&&snapshot<first;
  });
  const ledger=new Map();
  for(const row of weeklyActuals){
    const key=Number(row.gameweek)+'|'+Number(row.player_id);
    if(!ledger.has(key))ledger.set(key,{count:0,valid:true,minutes:0,points:0,confirmedZero:true,position:null});
    const x=ledger.get(key);
    x.count++;
    x.valid=x.valid&&row.is_final===true&&finite(row.minutes)&&finite(row.points);
    if(finite(row.minutes))x.minutes+=number(row.minutes);
    if(finite(row.points))x.points+=number(row.points);
    x.confirmedZero=x.confirmedZero&&row.source_kind==='fresh_closed_actual'&&
      finite(row.minutes)&&number(row.minutes)===0&&finite(row.points)&&number(row.points)===0;
    x.position=x.position||row.position||null;
  }
  const sum=()=>({n:0,abs:0,bias:0,minutes:0});
  const add=(s,p)=>{s.n++;s.abs+=Math.abs(p.predicted_xfp-p.actual_points);s.bias+=p.predicted_xfp-p.actual_points;s.minutes+=Math.abs(p.predicted_minutes-p.actual_minutes)};
  const finish=s=>({n:s.n,fp_mae:s.n?round(s.abs/s.n):null,minute_mae:s.n?round(s.minutes/s.n,2):null,fp_bias:s.n?round(s.bias/s.n):null});
  return allowed.map(w=>{
    const week=Number(w.gameweek),run=String(w.run_id),all=sum(),byPosition=new Map(),minuteDecisions=new Map();
    let ex_ante_total=0,unverified_zero=0,surprise_60=0,verified_played=0;
    for(const row of players){
      if(Number(row.gameweek)!==week||row.prediction_mode!=='live_frozen'||
        String(row.run_id)!==run||!finite(row.predicted_xfp)||!finite(row.actual_points)||
        !finite(row.predicted_minutes)||!finite(row.actual_minutes))continue;
      const p={predicted_xfp:number(row.predicted_xfp),actual_points:number(row.actual_points),
        predicted_minutes:number(row.predicted_minutes),actual_minutes:number(row.actual_minutes)};
      const x=ledger.get(week+'|'+Number(row.player_id));
      const matched=x&&x.count>0&&x.valid&&Math.abs(x.minutes-p.actual_minutes)<.05&&
        Math.abs(x.points-p.actual_points)<.05;
      const trusted=Boolean(matched&&(x.minutes>0||x.confirmedZero));
      if(trusted&&p.actual_minutes>0)verified_played++;
      if(trusted){
        const position=x.position||'UNKNOWN';
        if(!minuteDecisions.has(position))minuteDecisions.set(position,minuteDecision());
        const decision=minuteDecisions.get(position);
        decision.verified++;
        if(p.predicted_minutes>=30)decision.forecast_30_plus++;
        if(p.actual_minutes>=30)decision.actual_30_plus++;
        if(p.predicted_minutes>=30&&p.actual_minutes>=30)decision.forecast_30_actual_30++;
        if(p.predicted_minutes<30&&p.actual_minutes>=60){decision.surprise_60++;surprise_60++;}
        if(p.predicted_minutes>=30&&p.actual_minutes<30)decision.predicted_30_but_under_30++;
      }
      if(p.predicted_minutes<30)continue;
      ex_ante_total++;
      if(!trusted){
        if(p.actual_minutes===0&&p.actual_points===0)unverified_zero++;
        continue;
      }
      add(all,p);
      const position=x.position||'UNKNOWN';
      if(!byPosition.has(position))byPosition.set(position,sum());
      add(byPosition.get(position),p);
    }
    return {
      gameweek:week,snapshot_at:w.snapshot_at,
      ex_ante_total,unverified_zero,surprise_60,verified_played,
      ...finish(all),
      by_position:Object.fromEntries([...byPosition.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,finish(v)])),
      minutes_by_position:Object.fromEntries([...minuteDecisions.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,{
        ...v,active_30_precision:v.forecast_30_plus?round(v.forecast_30_actual_30/v.forecast_30_plus,3):null,
        active_30_recall:v.actual_30_plus?round(v.forecast_30_actual_30/v.actual_30_plus,3):null
      }]))
    };
  }).sort((a,b)=>a.gameweek-b.gameweek);
}
