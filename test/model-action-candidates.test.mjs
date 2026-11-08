import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateModelActionCandidates} from '../supabase/functions/weekly-model-lifecycle/modelActionCandidates.mjs';

const fixture={gameweek:8,kickoff_at:'2026-10-16T17:00:00Z'};
const week={gameweek:8,run_id:'frozen8',status:'closed',prediction_mode:'live_frozen',snapshot_at:'2026-10-16T10:00:00Z',prediction_count:2,actual_count:2};
const make=(id,mins,points,pm,actual,prevSource='fresh_closed_actual')=>({
 player:{gameweek:8,player_id:id,prediction_mode:'live_frozen',predicted_xfp:2,actual_points:points,predicted_minutes:pm,actual_minutes:actual,p25:1,p90:4},
 prior:{gameweek:7,player_id:id,minutes:mins,points:1,is_final:true,source_kind:prevSource,source_updated_at:'2026-10-12T12:00:00Z'},
 current:{gameweek:8,player_id:id,minutes:actual,points,is_final:true,source_kind:actual>0?'independently_calculated_source_events':'independently_calculated_source_events'},
 availability:{run_id:'frozen8',player_id:id,availability_probability:1}
});
test('candidate improves verified played minute error but excludes inferred zero',()=>{
 const a=make(1,90,3,20,80),b=make(2,90,0,20,0);
 const output=evaluateModelActionCandidates({weeks:[week],fixtures:[fixture],
 players:[a.player,b.player],weeklyActuals:[a.prior,b.prior,a.current,b.current],
 availability:[a.availability,b.availability]});
 const w=output.per_week[0];
 assert.equal(w.minutes.n,1);
 assert.equal(w.minutes.unverified_zero,1);
 assert.equal(w.minutes.baseline_mae,60);
 assert.equal(w.minutes.trial_mae,25);
 assert.equal(output.auto_promote,false);
 assert.equal(output.write_mode,'read_only');
});
test('cannot use post-snapshot evidence, risky availability or open weeks',()=>{
 const a=make(1,90,3,20,80);
 const after={...a.prior,source_updated_at:'2026-10-16T12:00:00Z'};
 for(const variation of [{prior:after},{availability:{...a.availability,availability_probability:.6}}]){
  const o=evaluateModelActionCandidates({weeks:[week],fixtures:[fixture],
   players:[a.player],weeklyActuals:[variation.prior||a.prior,a.current],
   availability:[variation.availability||a.availability]});
  assert.equal(o.per_week[0].minutes.n,0);
 }
 assert.equal(evaluateModelActionCandidates({weeks:[{...week,status:'open'}],fixtures:[fixture],
  players:[a.player],weeklyActuals:[a.prior,a.current],availability:[a.availability]}).per_week.length,0);
});
test('widening P25 lower tail is penalised when the original interval already covers outcome',()=>{
 const a=make(1,90,3,50,80);
 const o=evaluateModelActionCandidates({weeks:[week],fixtures:[fixture],
  players:[a.player],weeklyActuals:[a.prior,a.current],availability:[a.availability]});
 assert.equal(o.per_week[0].band.n,1);
 assert.equal(o.per_week[0].band.baseline_coverage,1);
 assert.equal(o.per_week[0].band.trial_coverage,1);
 assert.ok(o.per_week[0].band.improvement<0);
});
