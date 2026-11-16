import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWmrAvailability, matchSupplementaryPlayer, verifyWmrSuspension
} from "../supabase/functions/refresh-availability/secondarySources.mjs";

const fixture = "2026-11-22T16:00:00Z";
const caseHtml = [
  '<table><tr data-rang="58" data-name="Chibuike Nwaiwu" data-team="Trabzonspor" ',
  'data-art="sperre" data-seit="2026-11-09" data-rueck="2026-11-23">',
  '<td class="vz-grund" data-label="Neden">Sarı kart cezası</td></tr>',
  '<tr data-name="Random player" data-team="Trabzonspor" data-art="sonstiges">',
  '<td class="vz-grund">not eligible</td></tr>',
  '<tr data-name="Other injured" data-team="Amedspor" data-art="verletzung" ',
  'data-seit="2026-11-10" data-rueck="2026-12-01">',
  '<td class="vz-grund">Uyluk sakatlığı</td></tr></table>'
].join("");

const claims=parseWmrAvailability(caseHtml);
test("parses dated WmR suspensions and injuries, excluding other eligibility flags", () => {
  assert.equal(claims.length,2);
  assert.deepEqual(claims[0],{
    player:"Chibuike Nwaiwu",team:"Trabzonspor",kind:"suspensions",
    reason:"Sarı kart cezası",start:"2026-11-09",returnDate:"2026-11-23"
  });
  assert.equal(claims[1].kind,"injuries");
});

test("Nwaiwu uniquely matches the intended Trabzonspor defender, not a similarly named player",()=>{
  const names=(a,b)=>{
    const tokens=x=>x.toLowerCase().split(" ");
    const aT=tokens(a),bT=tokens(b);
    return aT.filter(x=>bT.includes(x)).length/Math.min(aT.length,bT.length);
  };
  const matched=matchSupplementaryPlayer(claims[0],
    [{id:37,team_id:1,full_name:"Chibuike Godfrey Nwaiwu"},
     {id:41,team_id:2,full_name:"Chibuike Nwaiwu"}],
    [{id:1,name:"Trabzonspor"},{id:2,name:"Eyüpspor"}],names);
  assert.equal(matched.playerId,37);
});

test("4th verified yellow in MH11 + 2nd source confirms MH12 card ban",()=>{
  assert.deepEqual(verifyWmrSuspension({
    row:claims[0],kickoffAt:fixture,primaryKind:"baseline",
    cumulativeYellow:4,lastWeekYellow:1,lastWeekRed:0,
    targetGameweek:12,evidenceGameweek:11
  }),{verified:true,reason:"source_plus_cumulative_and_last_match_yellow"});
});

test("never infer a ban from 3 yellows, absent recent card, wrong week, or expired dates",()=>{
  const good={
    row:claims[0],kickoffAt:fixture,primaryKind:"baseline",
    cumulativeYellow:4,lastWeekYellow:1,lastWeekRed:0,
    targetGameweek:12,evidenceGameweek:11
  };
  for(const override of [
    {cumulativeYellow:3},{lastWeekYellow:0},{targetGameweek:13},
    {kickoffAt:"2026-11-30T15:00:00Z"}
  ]) assert.equal(verifyWmrSuspension({...good,...override}).verified,false);
  assert.equal(verifyWmrSuspension({...good,row:claims[1]}).verified,false);
});

test("primary + supplementary suspension confirms only the affected fixture window",()=>{
  const req={row:claims[0],kickoffAt:fixture,primaryKind:"suspensions",
    cumulativeYellow:null,lastWeekYellow:null,lastWeekRed:null,
    targetGameweek:12,evidenceGameweek:11};
  assert.equal(verifyWmrSuspension(req).verified,true);
  assert.equal(verifyWmrSuspension({...req,kickoffAt:"2026-11-30T16:00:00Z"}).verified,false);
});

// Staleness guard: manual/source-verified availability changes must trigger
// the existing GitHub 50K pipeline, not leave xFP implying 90 minutes.
test("availability refresh rebuilds when current projection availability disagrees",async()=>{
  const {readFileSync}=await import("node:fs");
  const s=readFileSync(new URL("../supabase/functions/refresh-availability/index.ts",import.meta.url),"utf8");
  assert.match(s,/Math\.abs\(Number\(a\.availability_probability\)-Number\(projectedAvailability\.get/);
  assert.match(s,/const rebuildRequired=changed>0\|\|outOfSync>0/);
  assert.match(s,/source_coverage:coverage\.coverage,changed:changed\+outOfSync/);
  assert.match(s,/model_refresh_required:rebuildRequired/);
});

test("shared given name does not merge independent secondary reports",()=>{
  const names=(a,b)=>{
    const aa=a.toLowerCase().split(" "), bb=b.toLowerCase().split(" ");
    return aa.filter(x=>bb.includes(x)).length/Math.min(aa.length,bb.length);
  };
  const players=[{id:37,team_id:1,full_name:"Chibuike Godfrey Nwaiwu"}];
  const teams=[{id:1,name:"Trabzonspor"}];
  assert.equal(matchSupplementaryPlayer({
    player:"Chibuike Another",team:"Trabzonspor"
  },players,teams,names).playerId,undefined);
  assert.equal(matchSupplementaryPlayer({
    player:"Chibuike Nwaiwu",team:"Trabzonspor"
  },players,teams,names).playerId,37);
});

test("ambiguous source aliases are screened before PostgREST multi-row upsert",async()=>{
  const {readFileSync}=await import("node:fs");
  const src=readFileSync(new URL("../supabase/functions/refresh-availability/index.ts",import.meta.url),"utf8");
  assert.match(src,/const ambiguousIds=new Set/);
  assert.match(src,/ambiguousIds\.has\(Number\(identity\.playerId\)\)/);
});
