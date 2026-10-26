import test from "node:test";
import assert from "node:assert/strict";
import {acceptedFinalSource, validFinalWeeklyPlayerRow} from "../supabase/functions/weekly-model-lifecycle/closureSource.mjs";

const independent = "independently_calculated_source_events";
const row = {
  player_id: 1,match_id:317856,minutes:90,points:6,base_points:3,
  bonus_points:3,source_kind:independent,is_final:true
};
test("MH8 and explicitly owner-approved MH9 independent source are accepted, not other future weeks",()=>{
  assert.equal(acceptedFinalSource(8,independent),true);
  assert.equal(acceptedFinalSource(9,independent),true);
  assert.equal(acceptedFinalSource(10,independent),false);
  assert.equal(acceptedFinalSource(9,"source_unverified"),false);
  assert.equal(validFinalWeeklyPlayerRow(9,row),true);
  assert.equal(validFinalWeeklyPlayerRow(10,row),false);
});
test("MH9 zero-minute source-backed nonappearance can score zero only",()=>{
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,minutes:0,points:0,base_points:0,bonus_points:0}),true);
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,minutes:0,points:1,base_points:1,bonus_points:0}),false);
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,minutes:null}),false);
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,is_final:false}),false);
});
test("No bonus inflation or source-label fraud",()=>{
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,bonus_points:4}),false);
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,points:7}),false);
  assert.equal(validFinalWeeklyPlayerRow(9,{...row,source_kind:"fotmob_fantasy_score"}),false);
});
