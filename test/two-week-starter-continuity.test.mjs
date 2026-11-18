import test from 'node:test'
import assert from 'node:assert/strict'
import {P0_MINUTE_CONTINUITY_POLICY,twoWeekStarterContinuity} from '../supabase/functions/weekly-model-lifecycle/twoWeekStarterContinuity.mjs'

const week=(gameweek,minutes,source_updated_at)=>({
 gameweek,minutes,source_updated_at,
 source_kind:'independently_calculated_source_events',is_final:true
})
const good={baseline:.4,position:'MID',targetWeek:12,
 cutoffAt:'2026-11-20T17:00:00Z',availability:1,
 weekly:[week(11,83,'2026-11-10T00:00:00Z'),
 week(10,78,'2026-11-03T00:00:00Z')]};
test('two separate finalized recent 60+ events rescue a low conditional role',()=>{
 const a=twoWeekStarterContinuity(good)
 assert.equal(a.applied,true)
 assert.deepEqual(a.evidence_weeks,[11,10])
 assert.ok(a.delta>0&&a.delta<=.12)
 assert.ok(a.role>good.baseline&&a.role<.6)
 assert.equal(P0_MINUTE_CONTINUITY_POLICY,'two-week-continuity-checked-v1')
})
test('missing, 0/0, short stint and future imported source fail closed',()=>{
 for(const input of [
  {...good,weekly:good.weekly.slice(0,1)},
  {...good,weekly:[good.weekly[0],week(10,59,'2026-11-03T00:00:00Z')]},
  {...good,weekly:[good.weekly[0],week(10,0,'2026-11-03T00:00:00Z')]},
  {...good,weekly:[good.weekly[0],week(10,88,'2026-11-20T18:00:00Z')]},
  {...good,weekly:[good.weekly[0],{...good.weekly[1],is_final:false}]},
  {...good,weekly:[good.weekly[0],good.weekly[1],good.weekly[1]]},
  {...good,weekly:[good.weekly[0],{...good.weekly[1],source_updated_at:null}]}
 ])assert.equal(twoWeekStarterContinuity(input).applied,false)
})
test('no guessed starter for GK, unavailable player, or established starter',()=>{
 for(const input of [
  {...good,position:'GK'}, {...good,availability:.4},
  {...good,baseline:.72}, {...good,baseline:0},
  {...good,alreadyApplied:true},
  {...good,cutoffAt:null}
 ])assert.equal(twoWeekStarterContinuity(input).applied,false)
})
test('two-week fallback never compounds the same stable benchmark on intraday refresh',()=>{
 const first=twoWeekStarterContinuity(good)
 const second=twoWeekStarterContinuity({...good,baseline:first.role,alreadyApplied:true})
 assert.equal(second.role,first.role)
 assert.equal(second.delta,0)
})
test('clamps extreme low conditional weight to bounded lift',()=>{
 const a=twoWeekStarterContinuity({...good,baseline:.02})
 assert.equal(a.applied,true)
 assert.ok(a.delta<=.1200000001)
})
