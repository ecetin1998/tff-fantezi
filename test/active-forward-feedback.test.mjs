import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {FORWARD_LEARNING_V1,verifyForwardHistory,parseForwardExperiment,forwardFeedbackRate}
  from "../supabase/functions/weekly-model-lifecycle/activeForwardFeedback.mjs";

const require=createRequire(import.meta.url);
const {credibleAttackWeights}=require("../model/attackAllocation.js");
const weeks=[7,8,9].map(gameweek=>({
  gameweek,status:"closed",prediction_mode:"live_frozen",
  snapshot_at:`2026-10-${gameweek===7?"09":gameweek===8?"16":"23"}T10:00:00Z`,
  prediction_count:456,actual_count:456
}));
const fixtures=[7,8,9].map(gameweek=>({
  gameweek,kickoff_at:`2026-10-${gameweek===7?"09":gameweek===8?"16":"23"}T17:00:00Z`
}));
const mk=()=>{
  const forecasts=[],actuals=[];
  for(const [gameweek,n] of [[7,12],[8,8],[9,9]]){
    for(let i=0;i<n;i++){
      const player_id=gameweek*1000+i;
      forecasts.push({gameweek,player_id,prediction_mode:"live_frozen",
        predicted_minutes:75,actual_minutes:75,predicted_xfp:2.8,actual_points:1});
      actuals.push({gameweek,player_id,minutes:75,points:1,source_kind:"independently_calculated_source_events",is_final:true});
    }
  }
  return {forecasts,actuals};
};
test("only historically closed and sourced ex-ante FWD rows approve the trial",()=>{
  const {forecasts,actuals}=mk();
  const evaluation=verifyForwardHistory({weeks,fixtures,forecasts,actuals});
  assert.equal(evaluation.pass,true);
  assert.equal(evaluation.sample,29);
  assert.equal(evaluation.by_week[7].n,12);
  assert.equal(evaluation.by_week[8].n,8);
  assert.equal(evaluation.by_week[9].n,9);
  assert.equal(evaluation.by_week[8].mae_gain,.3);
  assert.equal(evaluation.auto_promotion,false);
});
test("unconfirmed zero, post-kickoff snapshots, altered points or missing holdout all fail closed",()=>{
  const {forecasts,actuals}=mk();
  const corrupted={...forecasts[0],actual_minutes:0,actual_points:0};
  const extra=verifyForwardHistory({
    weeks,fixtures,forecasts:[...forecasts,corrupted],actuals
  });
  assert.equal(extra.sample,29,"mismatched zero must not enter training");
  const lateWeeks=weeks.map(w=>w.gameweek===8?{...w,snapshot_at:"2026-10-16T19:00:00Z"}:w);
  assert.equal(verifyForwardHistory({weeks:lateWeeks,fixtures,forecasts,actuals}).pass,false);
  assert.equal(verifyForwardHistory({weeks,fixtures,forecasts,actuals:actuals.filter(x=>x.gameweek!==9)}).pass,false);
  const unlucky=forecasts.map(x=>x.gameweek===9?{...x,actual_points:9}:x);
  const outcomes=actuals.map(x=>x.gameweek===9?{...x,points:9}:x);
  assert.equal(verifyForwardHistory({weeks,fixtures,forecasts:unlucky,actuals:outcomes}).pass,false);
});
test("experiment config is explicit, pinned and never re-applied to later weeks",()=>{
  const config={status:"applied_pending_refresh",notes:JSON.stringify({
    version:FORWARD_LEARNING_V1.version,baseline_run_id:"a92ec107-99ba-4c78-b3e8-10e17b510c8e",
    target_gameweek:10,goal_assist_factor:.65
  })};
  assert.equal(parseForwardExperiment(config,10).factor,.65);
  assert.equal(parseForwardExperiment(config,11),null);
  assert.equal(parseForwardExperiment({...config,status:"watch"},10),null);
  assert.equal(parseForwardExperiment({...config,notes:"{broken"},10),null);
  assert.equal(forwardFeedbackRate("FWD",3,60,true),.65);
  assert.equal(forwardFeedbackRate("DEF",3,60,true),1);
  assert.equal(forwardFeedbackRate("FWD",3.5,60,true),1);
  assert.equal(forwardFeedbackRate("FWD",1.99,60,true),1);
  assert.equal(forwardFeedbackRate("FWD",3,29,true),1);
  assert.equal(forwardFeedbackRate("FWD",3,60,false),1);
});
test("the same learned event factor applies to goals, assists, and team-share inputs",()=>{
  const rates=[.4,.25,.2,.16,0,0,0,0,0,0,0,0,-1,-1,1];
  const standard=credibleAttackWeights("FWD","ST",rates);
  const adjusted=credibleAttackWeights("FWD","ST",[...rates.slice(0,14),.65]);
  assert.equal(adjusted.goal,standard.goal*.65);
  assert.equal(adjusted.assist,standard.assist*.65);
  assert.equal(credibleAttackWeights("DEF","WB",[...rates.slice(0,14),.65]).goal,
    credibleAttackWeights("DEF","WB",rates).goal);
  assert.equal(credibleAttackWeights("FWD","ST",rates.slice(0,14)).goal,standard.goal);
  assert.equal(credibleAttackWeights("FWD","ST",[...rates.slice(0,14),10]).goal,standard.goal);
  const edge=readFileSync(new URL("../supabase/functions/run-live-sim-chunk/index.ts",import.meta.url),"utf8");
  const lifecycle=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8");
  const source=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/defenderOpportunity.mjs",import.meta.url),"utf8");
  for(const s of [edge,source])
    assert.match(s,/eventFactor=position==="FWD"/);
  assert.match(lifecycle,/rates\[14\]=forwardFeedbackRate\(/);
  assert.match(lifecycle,/loadCurrentForwardFeedback\(sb,gw\)/);
  assert.match(lifecycle,/baselineRunId/);
});
