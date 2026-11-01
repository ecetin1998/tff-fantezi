import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sourceCoverageReport} from "../supabase/functions/weekly-model-lifecycle/sourceCoverage.mjs";
import {frozenAccuracyReport} from "../supabase/functions/weekly-model-lifecycle/frozenAccuracy.mjs";

const cutoffAt="2026-10-30T17:00:00Z";
const players=[{id:1,position:"MID",active:true},
 {id:2,position:"DEF",active:true},{id:3,position:"GK",active:true},
 {id:4,position:"FWD",active:true}];
const wk=(gameweek,player_id,minutes,source_kind="fresh_closed_actual",is_final=true)=>({
 gameweek,player_id,minutes,points:minutes>0?2:0,source_kind,is_final,
 source_updated_at:"2026-10-29T12:00:00Z"});
const shot=(gameweek,player_id,shots,key_passes,source="observed_at")=>({
 gameweek,player_id,shots,key_passes,[source]:"2026-10-29T12:00:00Z"});
const basic=()=>({
 gameweek:10,cutoffAt,players,
 weekly:[wk(7,1,90),wk(8,1,70),wk(9,1,85),
    wk(7,2,0,"independently_calculated_source_events"),
    wk(8,2,0,"independently_calculated_source_events"),
    wk(9,2,0,"independently_calculated_source_events"),
    wk(9,4,0)],
 advanced:[shot(7,1,3,4,"source_updated_at")],
 verified:[shot(8,1,3,4),shot(9,1,2,5)],
 tactical:[{gameweek:8,player_id:1,role:"AM",minutes:75,
   verified:true,started:true,observed_at:"2026-10-29T10:00:00Z"},
  {gameweek:9,player_id:1,role:"AM",minutes:85,
   verified:true,started:true,observed_at:"2026-10-29T10:00:00Z"}],
 stats:[{player_id:1,through_gameweek:9,advanced_through_gameweek:9,minutes:600}]
});
test("source reporting distinguishes verified 0, inferred 0 and missing results",()=>{
 const report=sourceCoverageReport(basic());
 assert.equal(report.ok,true);
 assert.equal(report.no_writes,true);
 assert.equal(report.active_players,4);
 assert.deepEqual(report.by_week[9],{
  final_played:1,confirmed_zero:1,inferred_zero:1,no_final_result:1,
  shots:1,key_passes:1,verified_shots:1,verified_key_passes:1
 });
 assert.equal(report.totals.inferred_zero,1);
 assert.equal(report.totals.confirmed_zero,1);
 assert.equal(report.totals.no_final_result,1);
 assert.equal(report.by_position.DEF.final_played,0);
 assert.equal(report.by_position.DEF.inferred_zero,1);
 assert.equal(report.by_position.GK.no_final_result,1);
 assert.equal(report.totals.eligible_shot_form,1);
 assert.equal(report.totals.eligible_key_pass_form,1);
 assert.equal(report.totals.tactical_roles_two_starts,1);
 assert.equal(report.data_policy.absent_row,"unknown_not_zero");
});
test("source cutoff and missing action counts never create artificial zero form",()=>{
 const d=basic();
 d.verified[1].observed_at="2026-10-30T17:00:01Z";
 d.advanced[0].shots=null;
 d.weekly[2].source_updated_at="2026-10-31T15:00:00Z";
 const out=sourceCoverageReport(d);
 assert.equal(out.by_week[9].verified_shots,0);
 assert.equal(out.totals.eligible_shot_form,0);
 assert.equal(out.totals.eligible_key_pass_form,0);
 assert.equal(out.by_position.MID.final_played,0,
   "post-kickoff weekly evidence must not be silently included");
});
test("bad cutoff and duplicate player roster fail closed",()=>{
 assert.equal(sourceCoverageReport({...basic(),cutoffAt:"not-a-date"}).ok,false);
 assert.equal(sourceCoverageReport({...basic(),players:[...players,players[0]]}).ok,false);
});
test("minute decisions are made from independently finalised player minutes",()=>{
 const weeks=[{gameweek:7,status:"closed",prediction_mode:"live_frozen",
    snapshot_at:"2026-10-09T10:00:00Z",prediction_count:4,actual_count:4}];
 const fixtures=[{gameweek:7,kickoff_at:"2026-10-09T17:00:00Z"}];
 const caseRow=(player_id,predicted_minutes,actual_minutes)=>
  ({gameweek:7,player_id,prediction_mode:"live_frozen",predicted_xfp:2,actual_points:0,
    six_plus_probability:.1,predicted_minutes,actual_minutes});
 const evalResult=frozenAccuracyReport({weeks,fixtures,
  players:[caseRow(1,15,90),caseRow(2,80,0),caseRow(3,80,0),caseRow(4,70,75)],
  positions:players.map(p=>({...p,id:p.id})),
  weeklyPositions:[
    {gameweek:7,player_id:1,minutes:90,points:0,is_final:true,source_kind:"fresh_closed_actual",position:"MID"},
    {gameweek:7,player_id:2,minutes:0,points:0,is_final:true,source_kind:"fresh_closed_actual",position:"DEF"},
    {gameweek:7,player_id:3,minutes:0,points:0,is_final:true,source_kind:"independently_calculated_source_events",position:"GK"},
    {gameweek:7,player_id:4,minutes:75,points:0,is_final:true,source_kind:"fresh_closed_actual",position:"FWD"}
  ]});
 const mid=evalResult.minutes_decision_by_position.MID;
 assert.equal(mid.verified,1);
 assert.equal(mid.forecast_under_30_actual_60_plus,1);
 assert.equal(mid.long_stint_60_recall,0);
 assert.equal(evalResult.minutes_decision_by_position.DEF.forecast_30_confirmed_dnp,1);
 assert.equal(evalResult.minutes_decision_by_position.GK.verified,0);
 assert.equal(evalResult.minutes_decision_by_position.GK.forecast_30_reconstructed_zero_excluded,1);
 assert.equal(evalResult.minutes_decision_by_week[7].verified,3);
 assert.equal(evalResult.minutes_decision_by_week[7].forecast_30_plus,2);
 assert.equal(evalResult.minutes_decision_by_week[7].active_30_precision,.5);
 assert.equal(evalResult.minutes_decision_by_week[7].active_30_recall,.5);
 assert.equal(evalResult.minutes_decision_by_week[7].long_stint_60_recall,.5);
});
test("source-coverage endpoint is read-only and uses historical week bounds",()=>{
 const index=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8");
 const block=index.slice(index.indexOf('if(action==="diagnose_sources")'),
     index.indexOf('if(action==="diagnose_backtest")'));
 assert.ok(block.length>1500);
 assert.match(block,/sourceCoverageReport\(/);
 assert.match(block,/offset\+=500/);
 assert.match(block,/\.range\(offset,offset\+499\)/);
 assert.match(block,/\.lt\("gameweek",gw\)/);
 assert.match(block,/\.order\("kickoff_at",\{ascending:true\}\)/);
 assert.doesNotMatch(block,/\.upsert\(|\.update\(|\.insert\(|\.delete\(|sb\.rpc\(/);
});
