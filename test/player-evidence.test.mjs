import test from 'node:test'
import assert from 'node:assert/strict'
import {evidenceOrigin,evidenceWeekCoverage,playerEvidenceSummary,xfpComponents} from '../lib/playerEvidence.mjs'

test('old xA source stays independently old despite fresh advanced actions',()=>{
 const result=playerEvidenceSummary({
   run:{gameweek:12,generated_at:'2026-11-18T16:56:00Z',source_updated_at:'2026-11-18T16:42:00Z'},
   player:{role_source:'verified_formation_mh9_11_2026-11-15',role_confidence:.95},
   season:{through_gameweek:11,advanced_through_gameweek:9,advanced_actions_through_gameweek:11,
     xa_source:'fotmob_xa_per90_web_2026-09-28',xa_confidence:.7,advanced_actions_verified_appearances:6,
     advanced_updated_at:'2026-10-26T22:17:43Z'},
   availability:{checked_at:'2026-11-18T09:00:00Z'}
 })
 assert.match(result.xa.detail,/28\.09\.2026/)
 assert.match(result.xa.value,/FotMob/)
 assert.match(result.role.value,/Doğrulanmış/)
 assert.equal(result.stats.missing,2)
 assert.equal(result.actions.missing,0)
 assert.match(result.model.detail,/tüm oyuncu alanlarının güncel olduğunu göstermez/)
})
test('prior is shown as prior even with a numeric source coefficient',()=>{
 const s=playerEvidenceSummary({
   run:{gameweek:12},
   player:{role_source:'fantasy_position_fallback',role_confidence:.99},
   season:{through_gameweek:11,xa_source:'position_prior',xa_confidence:.25}
 })
 assert.match(s.role.value,/Fantezi kayıtlı/)
 assert.match(s.xa.value,/Mevki öncülü/)
 assert.equal(s.xa.prior,true)
 assert.equal(s.actions.value,'Bilinmiyor')
})
test('missing vs 0 and date code parsing are fail-closed',()=>{
 assert.equal(evidenceWeekCoverage({currentWeek:12,seasonWeek:11,throughWeek:null}).missing,null)
 assert.equal(evidenceWeekCoverage({currentWeek:12,seasonWeek:11,throughWeek:11}).missing,0)
 assert.equal(evidenceWeekCoverage({currentWeek:12,seasonWeek:11,throughWeek:9}).missing,2)
 assert.match(evidenceOrigin('preseason_player_prior'),/öncülü/)
 assert.equal(playerEvidenceSummary({}).availability.value,'Tarih bilinmiyor')
})
test('xFP only reconciles actual stored core plus expected bonus',()=>{
 const x=xfpComponents({core_xfp:8.073,x_bonus:1.603,xfp:9.675,xi_probability:.998,x_minutes:88.62,appearance_probability:.999})
 assert.equal(x.available,true)
 assert.equal(x.consistent,true)
 assert.equal(x.inputSignals[1].value,'89 dk')
 const y=xfpComponents({core_xfp:4,x_bonus:.5,xfp:6})
 assert.equal(y.consistent,false)
 assert.equal(xfpComponents({core_xfp:null,x_bonus:.5,xfp:6}).available,false)
})
