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
const fixtures=[
 {gameweek:7,kickoff_at:"2026-10-09T17:00:00Z"},
 {gameweek:8,kickoff_at:"2026-10-16T17:00:00Z"},
 {gameweek:9,kickoff_at:"2026-10-23T17:00:00Z"},
 {gameweek:6,kickoff_at:"2026-09-27T17:00:00Z"}
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
 const out=frozenAccuracyReport({weeks,players,fixtures,
  positions:[{id:1,position:"DEF"},{id:2,position:"GK"}],
  weeklyPositions:[{gameweek:7,player_id:1,position:"DEF"},{gameweek:8,player_id:1,position:"MID"}]});
 assert.deepEqual(out.closed_weeks,[7,8]);
 assert.equal(out.sample,4);
 assert.equal(out.overall.n,4);
 assert.equal(out.overall.fp_mae,1.75);
 assert.equal(out.overall.fp_bias,-0.25);
 assert.equal(out.overall.minute_mae,12.5);
 assert.equal(out.overall.minute_bias,7.5);
 assert.equal(out.overall.six_plus_forecast,.25);
 assert.equal(out.overall.six_plus_observed,.5);
 assert.equal(out.overall.six_plus_brier,.225);
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
 const out=frozenAccuracyReport({weeks,players,fixtures});
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

test("a snapshot after first kickoff is rejected even when mislabeled live_frozen",()=>{
 const contaminated={...weeks[0],snapshot_at:"2026-10-09T18:00:00Z"};
 const out=frozenAccuracyReport({weeks:[contaminated,weeks[1]],
   fixtures,players:[row(7,1,50,50,90,90,1),row(8,1,2,2,80,80,.5)]});
 assert.deepEqual(out.closed_weeks,[8]);
 assert.equal(out.sample,1);
 assert.deepEqual(out.excluded_invalid_snapshots,[7]);
});

test("learning excludes easy 0/0 results and distinguishes source-confirmed from invented zero",()=>{
 const forecasts=[
  row(7,1,4,6,80,90,.3),          // true projected starter
  row(7,2,3,0,75,0,.2),           // confirmed DNP (recorded final)
  row(7,3,1,9,10,70,.05),         // missed surprise 60+
  row(7,4,.1,0,5,0,.01),         // inferred zero from reconstructed events
  row(7,5,0,0,5,0,.01),          // close-backtest filled zero with NO result record
  row(7,6,2,0,50,0,.1),          // high-impact but inferred DNP => never trusted
  row(7,7,.1,1,5,10,.01),        // surprising cameo
  row(7,8,2,1,40,90,.2)          // correctly predicted player
 ];
 const raw=(player_id,source_kind,minutes,points)=>({
  gameweek:7,player_id,source_kind,minutes,points,is_final:true,position:"DEF"
 });
 const report=frozenAccuracyReport({
   weeks:[{...weeks[0],prediction_count:8,actual_count:8}],
   fixtures,players:forecasts,
   weeklyPositions:[
     raw(1,"fresh_closed_actual",90,6),
     raw(2,"fresh_closed_actual",0,0),
     raw(3,"independently_calculated_source_events",70,9),
     raw(4,"independently_calculated_source_events",0,0),
     raw(6,"independently_calculated_source_events",0,0),
     raw(7,"independently_calculated_source_events",10,1),
     raw(8,"independently_calculated_source_events",90,1)
   ]
 });
 assert.equal(report.sample,8);
 assert.equal(report.learning_cohorts.legacy_all.n,8);
 assert.equal(report.learning_cohorts.ex_ante.n,3);
 assert.equal(report.learning_cohorts.ex_ante.fp_mae,2);
 assert.equal(report.learning_cohorts.actionable.n,5);
 assert.equal(report.learning_cohorts.ex_ante_all.n,4);
 assert.equal(report.learning_cohorts.played.n,4);
 assert.equal(report.learning_cohorts.surprise_starters.n,1);
 assert.equal(report.learning_cohorts.confirmed_unexpected_absences.n,1);
 assert.equal(report.learning_cohorts.trivial_zero_zero_monitor_only.n,2);
 assert.equal(report.evidence_quality.imputed_zero_without_source,1);
 assert.equal(report.evidence_quality.inferred_zero_from_events,2);
 assert.equal(report.evidence_quality.confirmed_source_zero,1);
 assert.equal(report.evidence_quality.predicted_active_absent,2);
 assert.equal(report.evidence_quality.confirmed_predicted_active_absent,1);
 assert.equal(report.evidence_quality.actionable_all,6);
 assert.equal(report.evidence_quality.actionable_eligible,5);
 assert.equal(report.evidence_quality.excluded_uncertain_active,1);
 assert.equal(report.learning_by_position["learning:position:DEF"].n,5);
 assert.equal(report.primary_learning_cohort,"ex_ante");
 assert.equal(report.learning_guardrails.can_change_weights_automatically,false);
});

test("only before-kickoff expected exposure defines training objective; realized play is diagnostic",()=>{
 const examples=[row(7,1,1,8,5,90,.01),row(7,2,3,0,70,0,.3)];
 const actual=[
  {gameweek:7,player_id:1,position:"DEF",source_kind:"fresh_closed_actual",minutes:90,points:8,is_final:true},
  {gameweek:7,player_id:2,position:"DEF",source_kind:"fresh_closed_actual",minutes:0,points:0,is_final:true}
 ];
 const result=frozenAccuracyReport({
  weeks:[{...weeks[0],prediction_count:2,actual_count:2}],players:examples,
  fixtures,weeklyPositions:actual
 });
 assert.equal(result.learning_cohorts.ex_ante.n,1);
 assert.equal(result.learning_cohorts.ex_ante.fp_mae,3);
 assert.equal(result.learning_cohorts.actionable.n,2);
 assert.equal(result.learning_cohorts.actionable.fp_mae,5);
 assert.equal(result.learning_cohorts.surprise_starters.n,1);
});

test("source points or minutes contradicting backtest rows cannot be used to train",()=>{
 const candidate=row(7,12,4,6,80,90,.35);
 const report=frozenAccuracyReport({
   weeks:[{...weeks[0],prediction_count:1,actual_count:1}],
   fixtures,players:[candidate],
   weeklyPositions:[{gameweek:7,player_id:12,position:"DEF",
     source_kind:"fresh_closed_actual",minutes:0,points:0,is_final:true}]
 });
 assert.equal(report.learning_cohorts.ex_ante,undefined);
 assert.equal(report.learning_cohorts.ex_ante_all.n,1);
 assert.equal(report.evidence_quality.mismatched_actual_source,1);
 assert.equal(report.evidence_quality.excluded_uncertain_active,1);
});
