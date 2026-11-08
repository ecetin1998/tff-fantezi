import test from "node:test";
import assert from "node:assert/strict";
import {freezeKeeperSot,keeperShotMean} from "../supabase/functions/weekly-model-lifecycle/keeperShotEvidence.mjs";
const src={team_id:9,through_gameweek:7,matches_played:7,shots_on_target_per_match:6.3,source_updated_at:"2026-10-12T21:45:04Z"};
test("pre-kickoff 7-match opponent SOT is frozen without future leakage",()=>{
  const out=freezeKeeperSot([src,{...src,team_id:8,source_updated_at:"2026-11-07T21:00:00Z"}],
    {gameweek:11,firstKickoff:"2026-11-06T17:00:00Z"});
  assert.equal(Object.keys(out.teams).length,1);
  assert.equal(out.teams["9"].shots_on_target,6.3);
  assert.equal(out.weight,.15);
});
test("stale, incomplete, future and suspect samples never affect a forecast",()=>{
 const variants=[
  {...src,through_gameweek:11},
  {...src,through_gameweek:6},
  {...src,matches_played:2},
  {...src,shots_on_target_per_match:0},
  {...src,shots_on_target_per_match:25},
  {...src,source_updated_at:"2026-11-06T17:01:00Z"}
 ];
 for(const row of variants)assert.deepEqual(freezeKeeperSot([row],
    {gameweek:11,firstKickoff:"2026-11-06T17:00:00Z"}).teams,{});
});
test("keeper shot expectation is a bounded, source-backed mixture with original fallback",()=>{
 const original=keeperShotMean(1.5,3,1);
 assert.ok(original>4.4&&original<4.42);
 assert.equal(keeperShotMean(1.5,3,1,null),original);
 assert.equal(keeperShotMean(1.5,3,1,0),original);
 const blended=keeperShotMean(1.5,3,1,7);
 assert.ok(blended>original&&blended<original+.4);
 assert.equal(keeperShotMean(1.5,3,.5,7),blended*.5);
 assert.equal(keeperShotMean(0,3,0,7),0);
});
