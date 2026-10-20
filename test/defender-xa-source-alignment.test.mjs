import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {reconcileDefenderXa} from '../supabase/functions/weekly-model-lifecycle/defenderXa.mjs'

const defender=(role='CB')=>({position:'DEF',primary_role:role})
const last=(minutes=90,kind='independently_calculated_source_events')=>
  ({minutes,source_kind:kind,is_final:true,gameweek:8})
const stats=(xa_total,xa_per90,modelPrior,minutes)=>({
  through_gameweek:8,advanced_through_gameweek:7,minutes,
  xa_total,xa_per90,xa_model_per90:modelPrior,xa_source:'fotmob_xa_per90_web_2026-09-28'
})
test('align two observed MH9 defender xA mismatches to confirmed seven-week exposure',()=>{
  const b=reconcileDefenderXa(stats(.3,.29,.06259934683968671,630),defender('CB'),last(90),.29)
  const m=reconcileDefenderXa(stats(.6,.22,.06212686567164179,708),defender('FB'),last(90),.22)
  assert.equal(b.adjusted,true);assert.equal(m.adjusted,true)
  assert.equal(b.source_minutes,540);assert.equal(m.source_minutes,618)
  assert.ok(Math.abs(b.implied-.05)<1e-12)
  assert.ok(Math.abs(m.implied-90*.6/618)<1e-12)
  assert.ok(Math.abs(b.rate-.05251986936793735)<1e-9)
  assert.ok(Math.abs(m.rate-.08232828575568758)<1e-9)
  assert.ok(b.rate<b.reported&&m.rate<m.reported)
  assert.match(b.reason,/normalized/)
})
test('defenders with consistent samples and attackers retain their xA',()=>{
  assert.equal(reconcileDefenderXa(stats(.5,.085,.04,540),defender(),last(),.085).rate,.085)
  assert.equal(reconcileDefenderXa(stats(.3,.29,.062,630),{position:'MID',primary_role:'AM'},last(),.29).rate,.29)
  assert.equal(reconcileDefenderXa(null,defender(),last(),.29).rate,.29)
})
test('missing/zero or non-final minutes and misaligned match weeks do not silently correct sources',()=>{
  for(const bad of [null,{...last(),minutes:null},{...last(),minutes:0},
    {...last(),is_final:false},{...last(),source_kind:'legacy_final_weekly'}]){
    assert.equal(reconcileDefenderXa(stats(.3,.29,.062,630),defender(),bad,.29).adjusted,false)
  }
  const s=stats(.3,.29,.062,630)
  assert.equal(reconcileDefenderXa({...s,advanced_through_gameweek:6},defender(),last(),.29).rate,.29)
  assert.equal(reconcileDefenderXa({...s,xa_total:null},defender(),last(),.29).rate,.29)
})
test('both weekly and intraday worker routes apply source rate without mutating observations',()=>{
  const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(worker,/const xaReconcile=reconcileDefenderXa\(s,p,rows\.find/)
  assert.match(worker,/const xaReconcile=reconcileDefenderXa\(stats,player,/)
  assert.match(worker,/defender-xa-source-window-v1/)
  assert.match(worker,/rateRaw=stats\?firstRecordedRate/)
  const input=stats(.3,.29,.062,630), copy=structuredClone(input)
  reconcileDefenderXa(input,defender(),last(),.29)
  assert.deepEqual(input,copy)
})
