import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {inspectDefenderAdvancedRow,auditDefenders}=require('../model/defenderRateInputAudit.js')

const bokele={
  player_id:291,primary_role:'CB',xa_total:0.3,xa_per90:0.29,
  xa_model_per90:0.06259934683968671,season_minutes:630,
  last_week_minutes:90,season_through_gameweek:8,advanced_through_gameweek:7,
  shots:5,shots_on_target:2,xg_total:1.46
}
const mendes={
  player_id:472,primary_role:'FB',xa_total:0.6,xa_per90:0.22,
  xa_model_per90:0.062,season_minutes:708,last_week_minutes:90,
  season_through_gameweek:8,advanced_through_gameweek:7,shots:9,shots_on_target:2
}

test('flag reviewed MH9 defender xA mismatches without claiming they are official errors',()=>{
  const a=inspectDefenderAdvancedRow(bokele).issues.find(x=>x.kind==='XA_RATE_TOTAL_MISMATCH')
  assert.ok(a)
  assert.equal(a.preview_only,true)
  assert.equal(a.coverage_minutes,540)
  assert.ok(Math.abs(a.implied_xa90-.05)<1e-10)
  assert.ok(Math.abs(a.preview_rate-.05251986936793735)<1e-10)
  const b=inspectDefenderAdvancedRow(mendes).issues.find(x=>x.kind==='XA_RATE_TOTAL_MISMATCH')
  assert.ok(b)
  assert.equal(b.coverage_minutes,618)
  assert.ok(Math.abs(b.implied_xa90-90*.6/618)<1e-10)
})

test('do not compare stats drawn from unrelated gameweeks or unknown minutes',()=>{
  for(const bad of [
    {...bokele,last_week_minutes:null},
    {...bokele,advanced_through_gameweek:5},
    {...bokele,season_through_gameweek:null},
    {...bokele,xa_total:null},
    {...bokele,xa_per90:null},
    {...bokele,season_minutes:45}
  ])assert.ok(!inspectDefenderAdvancedRow(bad).issues.some(x=>x.kind==='XA_RATE_TOTAL_MISMATCH'))
  const normal={...bokele,xa_total:1.5,xa_per90:0.25}
  assert.ok(!inspectDefenderAdvancedRow(normal).issues.some(x=>x.kind==='XA_RATE_TOTAL_MISMATCH'))
  const measuredZero={...bokele,xa_total:0,xa_per90:0}
  assert.ok(!inspectDefenderAdvancedRow(measuredZero).issues.some(x=>x.kind==='XA_RATE_TOTAL_MISMATCH'))
})

test('extreme defender shots are review alerts, not zeroes or scoring multipliers',()=>{
  const smolcic={player_id:239,primary_role:'CB',season_minutes:697,
    shots:110,shots_on_target:108,xg_total:0.03}
  const result=inspectDefenderAdvancedRow(smolcic)
  const issue=result.issues.find(x=>x.kind==='DEFENDER_SHOT_COUNT_OUTLIER')
  assert.ok(issue)
  assert.equal(issue.shots,110)
  assert.ok(issue.shots_per90>14)
  assert.ok(!inspectDefenderAdvancedRow({...smolcic,shots:null,shots_on_target:null}).issues.length)
  assert.ok(!inspectDefenderAdvancedRow({...smolcic,primary_role:'GK'}).issues.length)
  assert.equal(inspectDefenderAdvancedRow({...smolcic,shots:6,shots_on_target:7}).issues[0].kind,'SOT_EXCEEDS_SHOTS')
})

test('all checks produce a fail-safe read-only output',()=>{
  const summary=auditDefenders([bokele,mendes,{
    player_id:239,primary_role:'CB',season_minutes:697,
    shots:110,shots_on_target:108,xg_total:0.03
  }])
  assert.equal(summary.players_checked,3)
  assert.equal(summary.players_flagged,3)
  assert.equal(summary.issues_by_kind.XA_RATE_TOTAL_MISMATCH,2)
  assert.equal(summary.issues_by_kind.DEFENDER_SHOT_COUNT_OUTLIER,1)
  assert.equal(summary.can_write_model,false)
  assert.equal(summary.can_replace_source,false)
})
