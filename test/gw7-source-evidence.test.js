import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'data', 'source-evidence');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const events = read('gw7-fotmob-events-2026-10-12.json');
const lineups = read('gw7-fotmob-starting-xi-2026-10-12.json');
const saves = read('gw7-goalkeeper-saves-2026-10-12.json');
const participation = read('gw7-derived-player-participation-2026-10-12.json');
const staging = read('gw7-player-scoring-staging-2026-10-12.json');
const points = read('gw7-provisional-fantasy-scores-2026-10-12.json');
const byId = arr => new Map(arr.map(item => [item.match_id ?? item.id, item]));
const roster = byId(lineups.matches), keepers = byId(saves.matches), participated = byId(participation.matches), staged = byId(staging.matches), scored = byId(points.matches);
const count = (list, predicate) => list.filter(predicate).length;

test('GW7 evidence has exactly nine finished matches and matching score lines', () => {
 assert.equal(events.matches.length, 9);
 const ids = new Set();
 for (const m of events.matches) {
  assert(!ids.has(m.id), 'duplicate match id: ' + m.id);
  ids.add(m.id);
  const r = roster.get(m.id), k = keepers.get(m.id);
  assert(r && k && participated.get(m.id) && staged.get(m.id) && scored.get(m.id), 'missing paired source for ' + m.id);
  assert.equal(r.home_starting_xi.length, 11);
  assert.equal(r.away_starting_xi.length, 11);
  assert.equal(m.goals.filter(g => g[1] === m.home).length, m.score[0]);
  assert.equal(m.goals.filter(g => g[1] === m.away).length, m.score[1]);
  assert.equal(m.score.join(','), scored.get(m.id).score.join(','));
  assert(Number.isInteger(k.home_saves) && k.home_saves >= 0);
  assert(Number.isInteger(k.away_saves) && k.away_saves >= 0);
 }
 assert.deepEqual([...ids].sort((a,b)=>a-b),[317838,317839,317840,317841,317842,317843,317844,317845,317846]);
});

test('All 283 on-field participations carry sourced event points and minute thresholds', () => {
 const p = participation.matches.flatMap(m => m.players);
 const e = events.matches;
 assert.equal(e.reduce((n,m)=>n+m.goals.length,0),24);
 assert.equal(e.reduce((n,m)=>n+m.goals.filter(x=>x[2]).length,0),14);
 assert.equal(e.reduce((n,m)=>n+m.yellow.length,0),34);
 assert.equal(e.reduce((n,m)=>n+m.red.length,0),3);
 assert.equal(e.reduce((n,m)=>n+m.subs.length,0),85);
 assert.equal(p.length,283);
 assert.equal(count(p,x=>x.goals>0) >= 1,true);
 assert.equal(p.reduce((n,x)=>n+x.goals,0),24);
 assert.equal(p.reduce((n,x)=>n+x.assists,0),14);
 assert.equal(p.reduce((n,x)=>n+x.yellow_cards,0),34);
 assert.equal(p.reduce((n,x)=>n+x.red_cards,0),3);
 for(const x of p){
   assert(['61_plus','1_to_59','60_exact_confirmed'].includes(x.minutes_bucket), x.name + ' bad minute bucket');
   assert.equal(x.appearance_points, x.minutes_bucket === '61_plus' ? 2 : 1);
 }
 const eyp = participated.get(317839);
 for(const name of ['Konrad Michalak','Mete Kaan Demir','Yusuf Barası']){
  const x = eyp.players.find(p=>p.name === name);
  assert(x && x.minutes_bucket === '60_exact_confirmed' && x.appearance_points === 1);
 }
 const goals = events.matches.find(m => m.id===317839).goals;
 assert(goals.some(g=>g[0]==='André Henrique' && g[2]==='Richard Akonnor'), 'Göztepe 2nd-goal assist missing');
});

test('Provisional scores cover 283 without turning evidence into finalized public Fantasy data', () => {
 const all = points.matches.flatMap(m => m.players);
 assert.equal(all.length,283);
 assert.equal(count(all,p=>p.player_id == null),7);
 assert.equal(count(all,p=>p.base_points_candidate == null),0);
 assert.equal(count(all,p=>p.bonus_candidate==null),0);
 assert.equal(points.status,'PROVISIONAL_NOT_FOR_RELEASE');
 for(const m of points.matches){
  const ps=m.players;
  assert.equal(m.unresolved_player_count,count(ps,p=>p.player_id==null));
  const seen = new Set();
  for(const p of ps){
   if(p.player_id!==null){
    assert(!seen.has(p.player_id), 'duplicate player id in match '+m.match_id);
    seen.add(p.player_id);
   }
   const rank=1+count(ps,q=>q.base_points_candidate>p.base_points_candidate);
   const bonus=Math.max(0,4-rank);
   assert.equal(p.bonus_candidate, bonus, 'wrong tie-rank bonus for '+p.name);
   assert.equal(p.total_points_candidate,p.base_points_candidate+bonus,'wrong provisional total');
  }
 }
 for(const m of staging.matches){
  assert(m.players.every(p=>p.is_final===false && p.bonus_points===null), 'final or fabricated bonus in staging');
 }
 assert.equal(count(all,p=>p.player_id!==null),276);
 assert.equal(count(all,p=>p.bonus_candidate>0),46);
});
