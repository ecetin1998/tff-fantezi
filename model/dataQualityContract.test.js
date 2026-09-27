const fs=require('node:fs')
const assert=require('node:assert/strict')

;(async()=>{
  const {normalizeIngestName,normalizeShirtNumber}=await import('../lib/ingestNormalization.js')
  assert.equal(normalizeIngestName('I\u0307rfan'),'İrfan')
  assert.equal(normalizeIngestName('Go\u0308khan'),'Gökhan')
  assert.equal(normalizeShirtNumber(0),null)
  assert.equal(normalizeShirtNumber('0'),null)
  assert.equal(normalizeShirtNumber('10'),10)

  const data=fs.readFileSync('lib/data.js','utf8')
  assert.doesNotMatch(data,/scout_players'\)\.select\([^\n]*status/)
  assert.match(data,/short_label/)
  assert.match(data,/confidence/)
  assert.match(data,/canonical_reason/)
  assert.match(data,/expected_return_date/)
  assert.match(data,/eq\('season',CURRENT_SEASON\)/)

  const migration=fs.readFileSync('supabase/migrations/20260927145203_data_quality_normalization.sql','utf8')
  for(const marker of [
    'scout_model_runs_one_current',
    'availability_freshness',
    'xi_probability_over_097',
    'x_minutes_over_88',
    'shirt_number_zero',
    'combining_dot_names',
    'canonical_reason',
    'expected_return_date'
  ])assert.ok(migration.includes(marker),marker+' missing')

  const dgwIntegrity=fs.readFileSync('supabase/migrations/20260928001000_dgw_aware_projection_integrity.sql','utf8')
  assert.match(dgwIntegrity,/xi_probability,0\)<0 or coalesce\(p\.xi_probability,0\)>1\.000001/)
  assert.match(dgwIntegrity,/90\*coalesce\(fc\.fixture_count,0\)\+0\.001/)
  assert.match(dgwIntegrity,/fc\.fixture_count=1/)
  assert.match(dgwIntegrity,/not exists \(/)
  assert.match(dgwIntegrity,/xi_probability_out_of_bounds/)
  assert.match(dgwIntegrity,/x_minutes_out_of_bounds/)

  console.log('dataQualityContract: normalization and query contract ok')
})().catch(error=>{console.error(error);process.exit(1)})
