import test from 'node:test';
import assert from 'node:assert/strict';
import {mh12OwnerApprovedAdvancedLagAccepted} from '../supabase/functions/model-refresh-control/mh8AdvancedLag.mjs';

const lagIds=[215,220,275,284,423,428,431,443,448,515,1372,1504];
const lag=new Set(lagIds);
const allIds=new Set(lagIds);
for(let id=1;allIds.size<456;id++)allIds.add(id);
const ids=[...allIds].sort((a,b)=>a-b);
const playedIds=[...lagIds,...ids.filter(id=>!lag.has(id)).slice(0,266)];
const playing=new Set(playedIds);
function fixture(){
  const activePlayers=ids.map(id=>({id}));
  const stats=ids.map(id=>({player_id:id,through_gameweek:12,
    advanced_through_gameweek:lag.has(id)?9:playing.has(id)?12:11}));
  const teamStats=Array.from({length:18},(_,i)=>({team_id:i+1}));
  const matches=Array.from({length:9},(_,i)=>({match_id:317883+i,match_status:'Bitti',fantasy_closure:'KAPANDI'}));
  const weekly=ids.map(id=>{
    const pos=playedIds.indexOf(id);
    const played=pos>=0;
    const base=played?(pos<105?3:2):0;
    const bonus=played&&pos<81?1:0;
    return {player_id:id,minutes:played?70:0,base_points:base,bonus_points:bonus,
      points:base+bonus,is_final:true,source_kind:'mh12_owner_approved_independent_score_events'};
  });
  return {gameweek:12,activePlayers,stats,teamStats,matches,weekly};
}
test('MH12 source-labelled 266 observed + exactly 12 independently confirmed late-substitution lag is eligible',()=>{
  const source=fixture();
  assert.equal(source.weekly.reduce((n,w)=>n+w.points,0),742);
  assert.equal(source.weekly.reduce((n,w)=>n+w.bonus_points,0),81);
  assert.equal(source.weekly.filter(w=>w.minutes>0).length,278);
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(source),true);
});
test('strictly refuse unapproved lag player, fabricated weekly actuals, or incomplete match closure',()=>{
  const extra=fixture();
  const target=extra.stats.find(s=>playing.has(s.player_id)&&!lag.has(s.player_id));
  target.advanced_through_gameweek=9;
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(extra),false);
  const noProof=fixture();
  noProof.weekly[0].source_kind='mh12_highlightly_independent_provisional';
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(noProof),false);
  const altered=fixture();
  altered.weekly[0].points++;
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(altered),false);
  const noClose=fixture();
  noClose.matches[0].fantasy_closure='PUAN KONTROLÜ BEKLENİYOR';
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(noClose),false);
  const future=fixture();
  future.gameweek=13;
  assert.equal(mh12OwnerApprovedAdvancedLagAccepted(future),false);
});
