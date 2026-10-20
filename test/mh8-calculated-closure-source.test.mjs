import test from "node:test";
import assert from "node:assert/strict";
import {acceptedFinalSource,validFinalWeeklyPlayerRow} from "../supabase/functions/weekly-model-lifecycle/closureSource.mjs";

const candidate={
  player_id:84,match_id:317852,minutes:90,points:17,
  base_points:14,bonus_points:3,is_final:true,
  source_kind:"independently_calculated_source_events",
};

test("MH8 independently computed totals allowed only after explicit finality",()=>{
  assert.equal(acceptedFinalSource(8,candidate.source_kind),true);
  assert.equal(acceptedFinalSource(7,candidate.source_kind),false);
  assert.equal(acceptedFinalSource(9,candidate.source_kind),false);
  assert.equal(validFinalWeeklyPlayerRow(8,candidate),true);
  assert.equal(validFinalWeeklyPlayerRow(8,{...candidate,is_final:false}),false);
  assert.equal(validFinalWeeklyPlayerRow(9,candidate),false);
  assert.equal(validFinalWeeklyPlayerRow(8,{...candidate,source_kind:"unknown"}),false);
});

test("official source gate unchanged for other weeks",()=>{
  assert.equal(validFinalWeeklyPlayerRow(7,{
    ...candidate,source_kind:"fresh_closed_actual"
  }),true);
  assert.equal(validFinalWeeklyPlayerRow(9,{
    ...candidate,source_kind:"fresh_closed_actual"
  }),true);
});

test("do not accept missing or inconsistent Fantasy components",()=>{
  for(const invalid of [
    {minutes:null},{points:null},{base_points:null},
    {bonus_points:null},{bonus_points:4},{bonus_points:-1},
    {minutes:-1},{points:16},{base_points:13},
    {player_id:null},{match_id:null},
  ])assert.equal(validFinalWeeklyPlayerRow(8,{...candidate,...invalid}),false,
      JSON.stringify(invalid));
});

test("inferred zero-minute players cannot get synthetic positive points",()=>{
  assert.equal(validFinalWeeklyPlayerRow(8,{
    ...candidate,minutes:0,base_points:0,bonus_points:0,points:0
  }),true);
  assert.equal(validFinalWeeklyPlayerRow(8,{
    ...candidate,minutes:0,base_points:1,bonus_points:0,points:1
  }),false);
});
