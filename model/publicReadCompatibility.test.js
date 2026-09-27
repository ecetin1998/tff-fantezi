const fs=require('node:fs')
const assert=require('node:assert/strict')

const source=fs.readFileSync('lib/data.js','utf8')

for(const forbidden of [
  ".from('scout_model_runs').select('*')",
  ".from('scout_availability').select('*')",
  ".from('scout_learning_log').select('*')",
  'detail_source_label',
  'detail_source_url',
  'detail_source_updated_at',
  'source_url',
]){
  assert.equal(source.includes(forbidden),false,`public data layer must not request restricted field/query: ${forbidden}`)
}

console.log('publicReadCompatibility: ok')

assert.equal(/scout_players'\)\.select\([^\n]*\bstatus\b/.test(source),false,'public scout_players selects must not request deprecated status')
assert.equal(/scout_availability'\)\.select\([^\n]*(?:\breason\b|\bsource_reason\b|\bexpected_return\b)/.test(source),false,'public availability selects must use canonical_reason/expected_return_date only')
assert.match(source,/\bshort_label\b/)
assert.match(source,/\bconfidence\b/)
assert.match(source,/\bcanonical_reason\b/)
assert.match(source,/\bexpected_return_date\b/)
