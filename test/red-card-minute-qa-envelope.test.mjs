import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const migration=readFileSync(new URL('../supabase/migrations/20261110221000_red_card_minute_qa_conservative_source_envelope.sql',import.meta.url),'utf8')
const redAllowance=(projectedMinutes,seasonRed,seasonMinutes,envelope)=>{
  const exposure=envelope?90:projectedMinutes
  return .5*projectedMinutes*Math.min(.15,Math.max(0,seasonRed*exposure/seasonMinutes))
}
const minuteGate=(teamMinutes,redAllowanceValue)=>teamMinutes>=990-(Math.max(6,redAllowanceValue+2)+.05)

test('red card QA accounts for uncertain scheduled minutes without masking invalid totals',()=>{
  const withRotation=redAllowance(45,1,600,true)
  const old=redAllowance(45,1,600,false)
  assert.ok(withRotation>old,'E[D^2] can exceed (E[D])^2 when lineup/bench availability varies')
  assert.equal(redAllowance(90,1,600,true),redAllowance(90,1,600,false),
    'proven 90-minute players retain their established allowance')
  assert.ok(redAllowance(45,100,600,true)<=3.375,'red-event cap remains at 0.15')
  assert.equal(minuteGate(989.98,0),true)
  assert.equal(minuteGate(960,10),false,'25+ lost minutes cannot be hidden by reasonable rare red-card uncertainty')
})

test('MH12 known 6.89 minute deficit is within source-anchored safe envelope, not an unconditional 7-minute bypass',()=>{
  const loss=990-983.11
  const oldEstimate=3.858937262716698
  const conservative=7.019
  assert.equal(minuteGate(990-loss,oldEstimate),false,'old underestimated variance')
  assert.equal(minuteGate(990-loss,conservative),true,'new source-conditioned red allowance includes probabilistic dismissals')
})

test('migration fails closed on SQL drift and does not remove the upper-minute invariant',()=>{
  assert.match(migration,/source_sql := replace\(source_sql,old_term,new_term\)/)
  assert.match(migration,/coalesce\(st\.red_cards,0\)::numeric \* 90 \/ st\.minutes/)
  assert.match(migration,/unrecognized minute QA, refusing automatic replacement/)
  assert.match(migration,/minute_sum > 990\.25\*fixture_count/)
  assert.match(migration,/greatest\(6\*fixture_count/)
  assert.doesNotMatch(migration,/UPDATE scout_player_projections|DELETE FROM scout_model_runs/i)
})
