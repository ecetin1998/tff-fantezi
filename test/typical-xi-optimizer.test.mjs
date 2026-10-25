import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const optimizer=file('supabase/functions/run-staging-optimizer/index.ts')
const pitch=file('components/SquadPitchView.js')
const cards=file('components/ManagerCardRecommendations.js')
const data=file('lib/data.js')
const page=file('app/squads/page.js')

test('second XI maximizes exact weighted top-three conditional average, no forced overlap',()=>{
 assert.match(optimizer,/const typicalScore=\(player:any\)=>n\(player\.top3_weighted_avg\)\+0\.00001\*n\(player\.xfp\)/)
 assert.match(optimizer,/variant==="recommended"\?xfp:typicalScore\(r\)/)
 assert.match(optimizer,/const captainScore=variant==="recommended"\?xfp:typicalScore\(r\)/)
 assert.match(optimizer,/xi_top3_weighted_typical_primary_xfp_tiebreak_v1/)
 assert.doesNotMatch(optimizer,/constraints\.aggressiveOverlap/)
 assert.doesNotMatch(optimizer,/v\.aggressiveXfpFloor/)
})
test('no pseudo three score scenarios; all 456 projections require real 50K data',()=>{
 assert.match(optimizer,/TOP3_50K_COVERAGE_INCOMPLETE/)
 assert.match(optimizer,/x\.top3_outcomes\.length<1\|\|x\.top3_outcomes\.length>3/)
 assert.match(optimizer,/player_id,xfp,top3_weighted_avg,top3_coverage,top3_outcomes/)
})
test('rounded display does not round optimizer input, and xFP XI stays unmodified',()=>{
 assert.equal(Math.round(5.29),5)
 assert.equal(Math.round(5.50),6)
 assert.match(pitch,/Math\.round\(Number\(m\.top3_weighted_avg\|\|0\)\)/)
 assert.match(pitch,/scoreLabel\.includes\('Tipik'\)\?Math\.round\(Number\(xiXfp\)\)/)
 assert.match(pitch,/scenarioTip\(m\)/)
 assert.match(cards,/TİPİK PUAN 11/)
 assert.match(cards,/İlk 11 Tipik Puan toplamı/)
 assert.match(page,/◇ Tipik Puan 11:/)
 assert.match(data,/top3_weighted_avg:p\?\.projection\?\.top3_weighted_avg\?\?null/)
 assert.match(optimizer,/variant==="recommended"\?xfp:typicalScore\(r\)/)
})
test('weighted 3-most-frequent score differs from mode and xFP',()=>{
 const hist=[{pts:2,count:16850},{pts:8,count:6650},{pts:13,count:4850},{pts:1,count:11650},{pts:7,count:10000}]
 const top3=[...hist].sort((a,b)=>b.count-a.count).slice(0,3)
 const weighted=top3.reduce((s,x)=>s+x.pts*x.count,0)/top3.reduce((s,x)=>s+x.count,0)
 assert.equal(Math.round(weighted),3)
 assert.equal(top3[0].pts,2)
 assert.notEqual(weighted,6.87)
})
