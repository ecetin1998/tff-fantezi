const fs=require('node:fs')
const assert=require('node:assert/strict')

const route=fs.readFileSync('app/api/scout-data/route.js','utf8')
assert.match(route,/SCOUT_FEED_SCHEMA_VERSION/)
assert.match(route,/SCOUT_FEED_SECTIONS/)
assert.match(route,/schema_version:'2\.0'/)
assert.doesNotMatch(route,/SCOUT_FEED_SCOUT_FEED_SCHEMA_VERSION/)

console.log('routeRuntimeContract: import and fallback contract')
