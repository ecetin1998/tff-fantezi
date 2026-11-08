const assert=require('node:assert/strict');
(async()=>{
  const {verifiedFrozenWeeklyAccuracy}=await import('../lib/verifiedFrozenWeeklyAccuracy.mjs');
  const weeks=[{gameweek:10,run_id:'frozen',prediction_mode:'live_frozen',status:'closed',prediction_count:3,actual_count:3,snapshot_at:'2026-10-29T12:00:00Z'}];
  const fixtures=[{run_id:'frozen',kickoff_at:'2026-10-30T17:00:00Z'}];
  const players=[
    {gameweek:10,run_id:'frozen',player_id:1,prediction_mode:'live_frozen',predicted_xfp:2,actual_points:5,predicted_minutes:70,actual_minutes:90},
    {gameweek:10,run_id:'frozen',player_id:2,prediction_mode:'live_frozen',predicted_xfp:3,actual_points:0,predicted_minutes:60,actual_minutes:0},
    {gameweek:10,run_id:'frozen',player_id:3,prediction_mode:'live_frozen',predicted_xfp:1,actual_points:4,predicted_minutes:15,actual_minutes:80},
    {gameweek:10,run_id:'rolling',player_id:1,prediction_mode:'live_frozen',predicted_xfp:99,actual_points:5,predicted_minutes:70,actual_minutes:90}
  ];
  const weeklyActuals=[
    {gameweek:10,player_id:1,position:'MID',minutes:90,points:5,is_final:true,source_kind:'mh10_owner_approved_independent_score_events'},
    {gameweek:10,player_id:2,position:'FWD',minutes:0,points:0,is_final:true,source_kind:'independently_calculated_source_events'},
    {gameweek:10,player_id:3,position:'DEF',minutes:80,points:4,is_final:true,source_kind:'mh10_owner_approved_independent_score_events'}
  ];
  const [report]=verifiedFrozenWeeklyAccuracy({weeks,players,weeklyActuals,fixtures});
  assert.equal(report.ex_ante_total,2);
  assert.equal(report.n,1,'inferred zero/DNP must NOT inflate accuracy');
  assert.equal(report.unverified_zero,1);
  assert.equal(report.surprise_60,1);
  assert.equal(report.fp_mae,3);
  assert.equal(report.minute_mae,20);
  assert.equal(report.by_position.MID.n,1);
  assert.equal(verifiedFrozenWeeklyAccuracy({weeks:[{...weeks[0],snapshot_at:'2026-10-31T00:00:00Z'}],players,weeklyActuals,fixtures}).length,0,'post-kickoff snapshot is not an eligible backtest');
  assert.equal(verifiedFrozenWeeklyAccuracy({weeks:[{...weeks[0],status:'open'}],players,weeklyActuals,fixtures}).length,0,'open weeks cannot be scored');
  const verifiedDnp=[...weeklyActuals.slice(0,1),{...weeklyActuals[1],source_kind:'fresh_closed_actual'},weeklyActuals[2]];
  const [confirmed]=verifiedFrozenWeeklyAccuracy({weeks,players,weeklyActuals:verifiedDnp,fixtures});
  assert.equal(confirmed.n,2);
  assert.equal(confirmed.unverified_zero,0);
  console.log('verifiedFrozenWeeklyAccuracy: ok');
})().catch(error=>{console.error(error);process.exitCode=1});
