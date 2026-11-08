import test from "node:test";
import assert from "node:assert/strict";
import {mh11OwnerApprovedAdvancedLagAccepted as allowed} from "../supabase/functions/model-refresh-control/mh8AdvancedLag.mjs";

function snapshot(){
  const activePlayers=Array.from({length:456},(_,i)=>({id:i+1}));
  const stats=activePlayers.map((p,i)=>({player_id:p.id,through_gameweek:11,advanced_through_gameweek:i<174?7:9}));
  const teamStats=Array.from({length:18},(_,i)=>({team_id:i+1}));
  const matches=Array.from({length:9},(_,i)=>({match_id:317874+i,match_status:"Bitti",fantasy_closure:"KAPANDI"}));
  const weekly=activePlayers.map((p,i)=>{
    const plays=i<278;
    const base=plays?(i<171?3:2):0;
    const bonus=plays?(i<26?3:i===26?1:0):0;
    return {player_id:p.id,minutes:plays?90:0,points:base+bonus,base_points:base,bonus_points:bonus,
      is_final:true,source_kind:"mh11_owner_approved_independent_score_events"};
  });
  // Prove exact MH11 806 total, 79 bonus, 278 played, 178 DNP.
  // 171*3 + 107*2 = 727 base, plus 26*3+1 = 79 bonus -> 806 total.
  return {gameweek:11,activePlayers,stats,teamStats,matches,weekly};
}

test("MH11 owner-approved full final permits stale xG/xA while retaining provenance",()=>{
 const s=snapshot();
 assert.equal(s.weekly.reduce((sum,w)=>sum+w.points,0),806);
 assert.equal(s.weekly.reduce((sum,w)=>sum+w.bonus_points,0),79);
 assert.equal(allowed(s),true);
 assert.equal(s.stats[0].advanced_through_gameweek,7);
 assert.equal(s.stats[455].advanced_through_gameweek,9);
 assert.equal(allowed({...s,gameweek:12}),false);
});

test("reject partial, falsely official, or corrupted MH11 final inputs",()=>{
 const change=f=>{const s=snapshot();f(s);return allowed(s)};
 assert.equal(change(s=>s.weekly[0].is_final=false),false);
 assert.equal(change(s=>s.weekly[0].source_kind="fresh_closed_actual"),false);
 assert.equal(change(s=>s.weekly[0].points++),false);
 assert.equal(change(s=>s.weekly[0].base_points++),false);
 assert.equal(change(s=>s.weekly[0].minutes=null),false);
 assert.equal(change(s=>s.weekly[0].bonus_points=4),false);
 assert.equal(change(s=>s.weekly[278].points=2),false);
 assert.equal(change(s=>s.stats[0].advanced_through_gameweek=8),false);
 assert.equal(change(s=>s.stats[0].advanced_through_gameweek=12),false);
 assert.equal(change(s=>s.stats[0].through_gameweek=10),false);
 assert.equal(change(s=>s.matches[0].fantasy_closure="waiting"),false);
 assert.equal(change(s=>s.weekly.pop()),false);
 assert.equal(change(s=>s.activePlayers.pop()),false);
 assert.equal(change(s=>s.teamStats.pop()),false);
 assert.equal(change(s=>s.matches.pop()),false);
});
