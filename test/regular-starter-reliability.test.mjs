import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {regularStarterReliability as calibrate} from '../supabase/functions/weekly-model-lifecycle/regularStarterReliability.mjs'
import {starterDurationProfile} from '../supabase/functions/weekly-model-lifecycle/starterDuration.mjs'
const cutoff='2026-11-21T14:00:00Z'
const fin=(gameweek,minutes,kind='fresh_closed_actual')=>({
  gameweek,minutes,is_final:true,source_kind:kind,source_updated_at:'2026-11-09T12:00:00Z'
})
const xi=(gameweek,minutes,updated_at='2026-11-09T12:00:00Z')=>({
  gameweek,minutes,started:true,verified_first_11:true,
  source_url:'https://trusted.example.com/match',updated_at
})
const args={baseline:.705211111,seasonStarts:9,matchesPlayed:10,
  weekly:[fin(11,64,'mh11_owner_approved_independent_score_events'),
    fin(10,0,'mh10_owner_approved_independent_score_events'),fin(9,55),fin(8,67),fin(7,80),fin(6,90)],
  verified:[xi(11,64)],targetWeek:12,cutoffAt:cutoff,availability:1}
test('9/10 starting and a verified recent XI must not retain a stale ~70% role weight',()=>{
  const x=calibrate(args)
  assert.equal(x.applied,true)
  assert.ok(x.role>.82&&x.role<.85,JSON.stringify(x))
  assert.equal(x.evidenceWeek,11)
})
test('unverified zero stays unknown; independently verified bench or unavailable players get no uplift',()=>{
  assert.equal(calibrate({...args,verified:[]}).applied,false)
  assert.equal(calibrate({...args,weekly:[fin(11,0),...args.weekly.slice(1)]}).applied,false)
  assert.equal(calibrate({...args,availability:.4}).applied,false)
  assert.equal(calibrate({...args,verified:[{...xi(11,64),started:false,verified_first_11:false}]}).applied,false)
  assert.equal(calibrate({...args,verified:[xi(11,64,'2026-11-22T00:00:00Z')]}).applied,false)
})
test('sparse-season cameos, one-week flukes and prior-applied boosts never inflate weight',()=>{
  assert.equal(calibrate({...args,seasonStarts:2,matchesPlayed:3}).applied,false)
  assert.equal(calibrate({...args,baseline:.94}).applied,false)
  assert.equal(calibrate({...args,alreadyApplied:true}).applied,false)
  assert.equal(calibrate({...args,seasonStarts:6,matchesPlayed:11}).applied,false)
})
test('starter duration uses historical sourced 90s without treating 0 and bench cameo as departure',()=>{
  const x=starterDurationProfile({position:'MID',seasonStarts:9,weekly:args.weekly,
    verified:[],targetWeek:12,cutoffAt:cutoff})
  assert.deepEqual(x.durations,[64,67,80,90])
  assert.ok(x.durations.every(m=>m>=60))
  const extended=starterDurationProfile({position:'MID',seasonStarts:9,weekly:[
    ...args.weekly,fin(5,90),fin(4,90)],verified:[],targetWeek:12,cutoffAt:cutoff})
  assert.deepEqual(extended.durations,[64,67,80,90,90])
  assert.equal(extended.duration_weights.reduce((a,b)=>a+b,0),1)
})
test('weekly and intraday builders must both recompute source-backed regular-starter reliability',()=>{
  const lifecycle=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  const evidence=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/weeklyEvidence.mjs',import.meta.url),'utf8')
  assert.equal((lifecycle.match(/regularStarterReliability\(/g)||[]).length,2)
  assert.match(lifecycle,/season-starter-reliability-v1/)
  assert.match(lifecycle,/scout_match_player_evidence/)
  assert.match(evidence,/Number\(targetWeek\)-10/)
})

test('candidate audit requires all new starter-duration provenance, not just a changed code SHA',()=>{
  const src=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(src,/STARTER_DURATION_LONG_WINDOW_PROVENANCE_MISSING/)
  assert.match(src,/starter-duration-long-window-v3/)
  assert.match(src,/run\.is_current!==true/)
  assert.match(src,/select\("player_id,club_id,position,rates,availability,source_note"\)/)
})

test('long-minute history is independently copied before the five-week attack window is sliced',()=>{
  const src=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(src,/const longerMinuteHistory=new Map\(weeklyMomentumRows\)/)
  assert.match(src,/weeklyMomentumRows\.set\(playerId,weekly\.slice\(0,5\)\)/)
  assert.match(src,/weekly:longerMinuteHistory\.get\(Number\(x\.player_id\)\)\|\|\[\]/)
})

test('isolated 27-minute verified starter exit cannot dominate an eight-start 90-minute history',()=>{
 const long=[fin(10,90),fin(9,90),fin(8,90),fin(7,90)]
 const short={gameweek:11,minutes:27,started:true,verified:true,observed_at:'2026-11-09T12:00:00Z'}
 const x=starterDurationProfile({position:'DEF',seasonStarts:8,
   weekly:[fin(11,27),...long],verified:[short],targetWeek:12,cutoffAt:cutoff})
 assert.deepEqual(x.durations,[27,90,90,90,90])
 assert.ok(x.duration_weights[0]<=.13,JSON.stringify(x))
 assert.ok(x.duration_weights[0]>0,'sourced short stint must not be deleted')
 assert.ok(Math.abs(x.duration_weights.reduce((a,b)=>a+b,0)-1)<1e-9)
 assert.match(x.reason,/single_short_starter_shrunk/)
})
test('repeated verified short starts preserve genuine reduced-minute trends',()=>{
 const verified=[
  {gameweek:11,minutes:27,started:true,verified:true,observed_at:'2026-11-09T12:00:00Z'},
  {gameweek:10,minutes:45,started:true,verified:true,observed_at:'2026-11-09T12:00:00Z'}
 ]
 const x=starterDurationProfile({position:'MID',seasonStarts:9,
   verified,weekly:[fin(9,90),fin(8,90),fin(7,90)],
   targetWeek:12,cutoffAt:cutoff})
 assert.deepEqual(x.durations,[27,45,90,90,90])
 assert.ok(x.duration_weights[0]>.30,JSON.stringify(x))
 assert.doesNotMatch(x.reason,/single_short_starter_shrunk/)
})
test('low-sample cameo players never obtain stable-season outlier protection',()=>{
 const x=starterDurationProfile({position:'MID',seasonStarts:2,
   verified:[{gameweek:11,minutes:27,started:true,verified:true,observed_at:'2026-11-09T12:00:00Z'}],
   weekly:[fin(10,90),fin(9,90),fin(8,90)],
   targetWeek:12,cutoffAt:cutoff})
 assert.ok(x.duration_weights[0]>.30)
})
