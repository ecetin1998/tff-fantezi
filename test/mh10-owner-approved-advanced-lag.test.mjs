import test from "node:test";
import assert from "node:assert/strict";
import {mh10OwnerApprovedAdvancedLagAccepted as allow} from "../supabase/functions/model-refresh-control/mh8AdvancedLag.mjs";

function sample(){
  const activePlayers=Array.from({length:456},(_,i)=>({id:i+1}));
  const stats=activePlayers.map((p,i)=>({
    player_id:p.id,through_gameweek:10,
    advanced_through_gameweek:(i<237||(i>=284&&i<329))?9:7
  }));
  const teamStats=Array.from({length:18},(_,i)=>({team_id:i+1}));
  const matches=Array.from({length:9},(_,i)=>({
    match_id:317865+i,match_status:"Bitti",fantasy_closure:"KAPANDI"
  }));
  const weekly=activePlayers.map((p,i)=>{
    const played=i<284;
    const base=played?(2+(i<187?1:0)):0;
    const bonus=played?(i<9?3:i<18?2:i<27?1:0):0;
    return {
      player_id:p.id,minutes:played?90:0,
      points:base+bonus,base_points:base,bonus_points:bonus,is_final:true,
      source_kind:"mh10_owner_approved_independent_score_events"
    };
  });
  return {gameweek:10,activePlayers,stats,teamStats,matches,weekly};
}

test("narrow MH10 approval preserves historical advanced markers",()=>{
  const s=sample();
  assert.equal(s.weekly.reduce((sum,w)=>sum+w.points,0),809);
  assert.equal(s.weekly.reduce((sum,w)=>sum+w.bonus_points,0),54);
  assert.equal(allow(s),true);
  assert.equal(allow({...s,gameweek:9}),false);
  assert.equal(allow({...s,gameweek:11}),false);
  assert.equal(s.stats[240].advanced_through_gameweek,7);
});

test("MH10 approval requires exact coverage, provenance and checksums",()=>{
  const edit=fn=>{const s=sample();fn(s);return allow(s)};
  assert.equal(edit(s=>s.weekly[0].source_kind="fresh_closed_actual"),false);
  assert.equal(edit(s=>s.weekly[0].is_final=false),false);
  assert.equal(edit(s=>s.weekly[0].points++),false);
  assert.equal(edit(s=>s.weekly[284].points=1),false);
  assert.equal(edit(s=>s.weekly[284].minutes=0.01),false);
  assert.equal(edit(s=>s.stats[0].through_gameweek=9),false);
  assert.equal(edit(s=>s.stats[0].advanced_through_gameweek=6),false);
  assert.equal(edit(s=>s.matches[0].fantasy_closure="Kontrol bekliyor"),false);
  assert.equal(edit(s=>s.teamStats.pop()),false);
  assert.equal(edit(s=>s.weekly.pop()),false);
  assert.equal(edit(s=>s.activePlayers.pop()),false);
});
