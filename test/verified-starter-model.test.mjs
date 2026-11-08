import test from "node:test";
import assert from "node:assert/strict";
import {stabilizeVerifiedStarter} from "../supabase/functions/weekly-model-lifecycle/verifiedStarter.mjs";
const proven={gameweek:10,minutes:90,points:2,is_final:true,source_kind:"mh10_owner_approved_independent_score_events",source_updated_at:"2026-11-02T10:00:00Z"};
const f=(args={})=>stabilizeVerifiedStarter({baseline:.32,targetWeek:11,
  cutoffAt:"2026-11-06T17:00:00Z",availability:1,weekly:[proven],...args});
test("verified prior starter gives capped upward XI weight, not guaranteed minutes",()=>{
 const p=f();assert.equal(p.applied,true);assert.ok(p.delta>0&&p.delta<=.14);
 assert.ok(p.role<.68);assert.equal(p.evidenceWeek,10);
});
test("never learn from source evidence observed after kickoff or a missing/zero result",()=>{
 assert.equal(f({weekly:[{...proven,source_updated_at:"2026-11-07T12:00:00Z"}]}).applied,false);
 assert.equal(f({weekly:[{...proven,minutes:0}]}).applied,false);
 assert.equal(f({weekly:[{...proven,gameweek:9}]}).applied,false);
 assert.equal(f({weekly:[{...proven,is_final:false}]}).applied,false);
 assert.equal(f({weekly:[{...proven,source_updated_at:null}]}).applied,false);
});
test("suspension, strong baseline and repeated intraday refreshes do not compound",()=>{
 assert.equal(f({availability:.6}).applied,false);
 assert.equal(f({baseline:.81}).applied,false);
 const once=f();const again=f({baseline:once.role,alreadyApplied:true});
 assert.equal(again.role,once.role);assert.equal(again.applied,false);
});
