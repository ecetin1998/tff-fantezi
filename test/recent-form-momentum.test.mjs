import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {risingMinutesMomentum} from '../supabase/functions/weekly-model-lifecycle/momentum.mjs'

const h=(gameweek,minutes,source_kind='fresh_closed_actual',is_final=true)=>({gameweek,minutes,source_kind,is_final})
const week=(a,b,c,d)=>[h(8,a,'independently_calculated_source_events'),h(7,b),h(6,c),h(5,d)]
test('breakout requires sustained two recent appearances and a reliable older baseline',()=>{
  const candidate=risingMinutesMomentum(week(90,80,20,10),9)
  assert.equal(candidate.rising,true)
  assert.equal(candidate.signal,'ÇIKIŞTA • SÜRE ARTIŞI')
  assert.deepEqual(candidate.evidence_weeks,[8,7,6,5])
  assert.equal(candidate.recent_minutes,85)
  assert.equal(candidate.prior_minutes,15)
  assert.ok(candidate.role_uplift>.02 && candidate.role_uplift<=.06)
})
test('no uplift for steady starters, single-game spike, recent nonparticipants',()=>{
  assert.equal(risingMinutesMomentum(week(90,90,90,90),9).rising,false)
  assert.equal(risingMinutesMomentum(week(90,10,0,0),9).rising,false)
  assert.equal(risingMinutesMomentum(week(0,90,15,15),9).rising,false)
  assert.equal(risingMinutesMomentum(week(70,90,72,83),9).rising,false)
  assert.equal(risingMinutesMomentum(week(70,70,58,58),9).rising,false)
})
test('no uplift when unavailable, old samples, incomplete finality or synthetic zero',()=>{
  assert.equal(risingMinutesMomentum(week(90,90,10,10),9,.5).rising,false)
  assert.equal(risingMinutesMomentum(week(90,90,10,10),10).rising,false)
  assert.equal(risingMinutesMomentum([h(8,90,false),h(7,90),h(6,10),h(5,10)],9).rising,false)
  assert.equal(risingMinutesMomentum([h(8,90,'independently_calculated_source_events',false),h(7,90),h(6,10),h(5,10)],9).rising,false)
  // An MH8 inferred 0 minute is not verified evidence of a player being benched.
  assert.equal(risingMinutesMomentum([h(8,90,'independently_calculated_source_events'),h(7,90),h(6,0),h(5,0,'legacy_final_weekly')],9).prior_minutes,0)
  assert.equal(risingMinutesMomentum([h(8,90,'independently_calculated_source_events'),h(7,90),h(6,0),h(5,0,'legacy_final_weekly')],9).evidence_weeks.length,3)
  assert.equal(risingMinutesMomentum([h(8,90,'independently_calculated_source_events'),h(7,90),h(6,0,'legacy_final_weekly'),h(5,0,'legacy_final_weekly')],9).rising,false)
})
test('one genuine prior week allows reduced-confidence rise; never more than +0.06',()=>{
  const v=risingMinutesMomentum([h(8,90,'independently_calculated_source_events'),h(7,90),h(6,0)],9)
  assert.equal(v.rising,true)
  assert.ok(v.role_uplift<=.03)
  const cap=risingMinutesMomentum(week(90,90,0,0),9)
  assert.ok(cap.role_uplift<=.06)
})
test('model does not double count rising form or use points as an xFP bonus',()=>{
  const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(worker,/risingMinutesMomentum\(rows,target/)
  assert.match(worker,/risingMinutesMomentum\(weeklyMomentumRows\.get/)
  assert.match(worker,/String\(stableInput\.source_note\|\|""\)\.includes\("momentum-v1"\)/)
  assert.match(worker,/roleProb\+momentum\.role_uplift/)
  assert.match(worker,/baseline:clamp\(\.01,\.995,stableRole\+momentumBoost\)/)
  assert.doesNotMatch(worker,/rates\[0\]\s*\*=\s*1\+/)
  assert.doesNotMatch(worker,/rates\[3\]\s*\*=\s*1\+/)
})
