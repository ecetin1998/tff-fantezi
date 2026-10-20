import test from "node:test";
import assert from "node:assert/strict";
import {mh8CalculatedAdvancedLagAccepted as allow} from "../supabase/functions/model-refresh-control/mh8AdvancedLag.mjs";

function sample(){
 const activePlayers=Array.from({length:456},(_,i)=>({id:i+1}));
 const stats=activePlayers.map(p=>({player_id:p.id,through_gameweek:8,advanced_through_gameweek:7}));
 const teamStats=Array.from({length:18},(_,i)=>({team_id:i+1}));
 const matches=Array.from({length:9},(_,i)=>({match_id:317847+i,match_status:"Bitti",fantasy_closure:"KAPANDI"}));
 const weekly=activePlayers.map((p,i)=>{
   const played=i<286;
   const base=played?(i<118?3:2):0;
   const bonus=played?(i<37?3:i===37?2:0):0;
   return {player_id:p.id,minutes:played?90:0,points:base+bonus,
     base_points:base,bonus_points:bonus,is_final:true,source_kind:"independently_calculated_source_events"};
 });
 return {gameweek:8,activePlayers,stats,teamStats,matches,weekly};
}

test("exact MH8 derived closure permits one-week xG lag without mislabeling advanced data",()=>{
 const s=sample();
 assert.equal(s.weekly.reduce((sum,w)=>sum+w.points,0),803);
 assert.equal(s.weekly.reduce((sum,w)=>sum+w.bonus_points,0),113);
 assert.equal(allow(s),true);
 assert.equal(s.stats[0].advanced_through_gameweek,7);
 assert.equal(allow({...s,gameweek:7}),false);
 assert.equal(allow({...s,gameweek:9}),false);
});

test("reject incomplete closure, unofficial source or fabricated advanced freshness",()=>{
 const make=(change)=>{const s=sample();change(s);return allow(s)};
 assert.equal(make(s=>s.weekly[0].is_final=false),false);
 assert.equal(make(s=>s.weekly[0].source_kind="fresh_closed_actual"),false);
 assert.equal(make(s=>s.weekly[0].minutes=null),false);
 assert.equal(make(s=>s.weekly[0].bonus_points=4),false);
 assert.equal(make(s=>s.weekly[0].points+=1),false);
 assert.equal(make(s=>s.weekly[286].points=2),false);
 assert.equal(make(s=>s.stats[0].advanced_through_gameweek=6),false);
 assert.equal(make(s=>s.stats[0].advanced_through_gameweek=8),false);
 assert.equal(make(s=>s.matches[0].fantasy_closure="PUAN KONTROLÜ BEKLENİYOR"),false);
 assert.equal(make(s=>s.matches.pop()),false);
 assert.equal(make(s=>s.teamStats.pop()),false);
 assert.equal(make(s=>s.weekly.pop()),false);
 assert.equal(make(s=>s.activePlayers.pop()),false);
});

test("requires source-backed exact week8 bonus and scoring checksum",()=>{
 const s=sample();
 s.weekly[0].points+=1;
 s.weekly[0].base_points+=1;
 assert.equal(allow(s),false);
});
