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
]){
  assert.equal(source.includes(forbidden),false,`public data layer must not request restricted field/query: ${forbidden}`)
}

console.log('publicReadCompatibility: ok')
