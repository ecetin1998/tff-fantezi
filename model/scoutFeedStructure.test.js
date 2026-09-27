const fs=require('node:fs')
const assert=require('node:assert/strict')

const route=fs.readFileSync('app/api/scout-data/route.js','utf8')
const keyed=fs.readFileSync('app/api/scout-data/summary/route.js','utf8')
const feed=fs.readFileSync('lib/scoutFeed.js','utf8')

assert.match(route,/buildScoutSummary/)
assert.match(keyed,/buildScoutSummary/)
assert.match(route,/SCOUT_FEED_SCHEMA_VERSION/)
assert.match(keyed,/SCOUT_FEED_SCHEMA_VERSION/)
assert.match(feed,/export const SCOUT_FEED_SCHEMA_VERSION='2\.0'/)
assert.equal((route.match(/const top_players=/g)||[]).length,0)
assert.equal((keyed.match(/const topPlayers=/g)||[]).length,0)
assert.equal((feed.match(/top_players=/g)||[]).length,1)
assert.doesNotMatch(keyed,/SCHEMA_VERSION='1\.0'/)

console.log('scoutFeedStructure: shared summary builder and schema version')
