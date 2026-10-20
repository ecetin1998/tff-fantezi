import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
const require=createRequire(import.meta.url)
const {inspectDefenderXa,inspectShots}=require('../model/defenderSourceQuality.js')
const {replay}=require('../scripts/audit_mh9_defender_xa.js')
const data=JSON.parse(readFileSync(new URL('../data/source-evidence/mh9-defender-xa-paired-input-20261021.json',import.meta.url)))
test('immutable MH9 audit source: full 456-player/9-fixture snapshot with documented run',()=>{
  assert.equal(data.gameweek,9)
  assert.equal(data.players.length,456)
  assert.equal(new Set(data.players.map(p=>p.id)).size,456)
  assert.equal(data.matches.length,9)
  assert.equal(data.team_checks.length,18)
  assert.equal(data.adjustments.length,2)
  assert.equal(data.kind,'MH9_NON_PRODUCTION_DEFENDER_XA_DIAGNOSTIC')
  assert.match(data.caveat,/excludes production overdispersion/)
})
test('strong mismatches stay review candidates, not automatic evidence overrides',()=>{
  const expected=new Map([[291,{observed:.29,implied:.05}],
    [472,{observed:.22,implied:.6*90/618}]])
  for(const evidence of data.adjustments){
    const audit=inspectDefenderXa(evidence)
    assert.equal(audit.suspicious,true)
    assert.equal(audit.auto_publish_allowed,false)
    assert.ok(Math.abs(audit.source_xa90-expected.get(evidence.player_id).observed)<1e-10)
    assert.ok(Math.abs(audit.implied_xa90-expected.get(evidence.player_id).implied)<1e-10)
    assert.ok(audit.candidate_xa90>0)
    assert.ok(audit.candidate_xa90<audit.source_xa90)
  }
})
test('actual observed xA zero remains a real zero, not a mistaken missing field',()=>{
  assert.equal(inspectDefenderXa({player_id:22,source_xa_total:0,source_xa90:0,
    model_prior_xa90:.07,minutes_through_mh7:600,advanced_through_gameweek:7,role:'CB'}).suspicious,false)
  assert.throws(()=>inspectDefenderXa({player_id:22,source_xa_total:null,source_xa90:.2,
    model_prior_xa90:.04,minutes_through_mh7:600,advanced_through_gameweek:6,role:'CB'}),/Not comparable/)
})
test('improbable CB shot volume is only flagged; source stats remain untouched',()=>{
  const candidate={role:'CB',shots:110,shots_on_target:108,minutes:697}
  const saved=structuredClone(candidate)
  assert.deepEqual(inspectShots(candidate),{review:true,reason:'implausible_stopper_shot_volume'})
  assert.deepEqual(candidate,saved)
  assert.equal(inspectShots({role:'CB',shots:7,shots_on_target:2,minutes:700}).review,false)
  assert.equal(inspectShots({role:'FB',shots:12,shots_on_target:3,minutes:700}).review,false)
  assert.equal(inspectShots({role:'CB',shots:6,shots_on_target:10,minutes:700}).reason,'invalid_shot_totals')
})
test('500-draw paired smoke: same random path lowers both contradictory xA cases',()=>{
  const summary=replay({draws:500,seed:20261021})
  assert.equal(summary.production_equivalent,false)
  assert.equal(summary.players,456)
  assert.equal(summary.targets.length,2)
  assert.ok(summary.targets.every(x=>x.delta<0))
})
