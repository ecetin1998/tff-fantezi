import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {frozenAccuracyReport} from "../supabase/functions/weekly-model-lifecycle/frozenAccuracy.mjs";

const weeks=[
 {gameweek:7,status:"closed",prediction_mode:"live_frozen",snapshot_at:"2026-10-09T12:00:00Z",prediction_count:2,actual_count:2},
 {gameweek:8,status:"closed",prediction_mode:"live_frozen",snapshot_at:"2026-10-16T10:00:00Z",prediction_count:2,actual_count:2},
 {gameweek:9,status:"open",prediction_mode:"live_frozen",snapshot_at:"2026-10-20T10:00:00Z",prediction_count:1,actual_count:0},
 {gameweek:6,status:"closed",prediction_mode:"replay",snapshot_at:"2026-09-27T10:00:00Z",prediction_count:1,actual_count:1}
];
const row=(gameweek,player_id,predicted_xfp,actual_points,predicted_minutes,actual_minutes,six_plus_probability,prediction_mode="live_frozen")=>({
 gameweek,player_id,predicted_xfp,actual_points,predicted_minutes,actual_minutes,six_plus_probability,prediction_mode
});
test("only closed immutable live_frozen actuals contribute to accuracy",()=>{
 const players=[
  row(7,1,4,6,80,90,.3),row(7,2,2,0,20,0,.1),
  row(8,1,5,7,70,60,.4),row(8,2,1,0,10,0,.2),
  row(9,1,10,0,90,0,.9),row(6,1,100,0,90,0,.9,"replay")
 ];
 const out=frozenAccuracyReport({weeks,players,
  positions:[{id:1,position:"DEF"},{id:2,position:"GK"}],
  weeklyPositions:[{gameweek:7,player_id:1,position:"DEF"},{gameweek:8,player_id:1,position:"MID"}]});
 assert.deepEqual(out.closed_weeks,[7,8]);
 assert.equal(out.sample,4);
 assert.equal(out.overall.n,4);
 assert.equal(out.overall.fp_mae,1.75);
 assert.equal(out.overall.fp_bias,-0.75);
 assert.equal(out.overall.minute_mae,12.5);
 assert.equal(out.overall.minute_bias,5);
 assert.equal(out.overall.six_plus_forecast,.25);
 assert.equal(out.overall.six_plus_observed,.5);
 assert.equal(out.overall.six_plus_brier,.175);
 assert.equal(out.by_position["position:DEF"].n,1);
 assert.equal(out.by_position["position:MID"].n,1);
 assert.equal(out.by_position["position:GK"].n,2);
 assert.equal(out.by_minute_bucket["minutes:70+"].n,2);
 assert.equal(out.auto_tuning_permitted,false);
 assert.equal(out.no_writes,true);
});

test("missing actual or missing forecasts are excluded, never imputed as zero",()=>{
 const players=[row(7,1,3,null,90,null,.2),row(7,1,null,3,80,90,.2),
   row(7,1,3,0,5,0,.2),row(8,1,1,1,5,0,.1)];
 const out=frozenAccuracyReport({weeks,players});
 assert.equal(out.sample,2);
 assert.equal(out.overall.fp_mae,1.5);
 assert.equal(out.overall.six_plus_observed,0);
});

test("protected report endpoint paginates historical rows and never updates backtests",()=>{
 const src=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8");
 const action=src.slice(src.indexOf('if(action==="diagnose_backtest")'),src.indexOf('if(action==="audit_run")'));
 assert.ok(action.length>500);
 assert.match(action,/\.eq\("status","closed"\)\.eq\("prediction_mode","live_frozen"\)/);
 assert.match(action,/\.not\("actual_points","is",null\)/);
 assert.match(action,/offset\+=500/);
 assert.match(action,/\.range\(offset,offset\+499\)/);
 assert.doesNotMatch(action,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|sb\.rpc\(/);
});
