const fs=require('node:fs')
const assert=require('node:assert/strict')

;(async()=>{
  const {responseHeadersFor,shouldUsePublicPayloadCache}=await import('../lib/scoutApiPolicy.mjs')
  const base={
    'Cache-Control':'public, s-maxage=300',
    'CDN-Cache-Control':'public, s-maxage=300',
    'Vercel-CDN-Cache-Control':'public, s-maxage=300'
  }

  assert.equal(shouldUsePublicPayloadCache(false),true)
  assert.equal(shouldUsePublicPayloadCache(true),false)

  const keyed=responseHeadersFor(base,{privateResponse:true,varyApiKey:true})
  assert.equal(keyed['Cache-Control'],'private, no-store')
  assert.equal(keyed['CDN-Cache-Control'],'no-store')
  assert.equal(keyed['Vercel-CDN-Cache-Control'],'no-store')
  assert.equal(keyed.Vary,'x-api-key')

  const publicPerformance=responseHeadersFor(base,{privateResponse:false,varyApiKey:true})
  assert.match(publicPerformance['Cache-Control'],/s-maxage=300/)
  assert.equal(publicPerformance.Vary,'x-api-key')

  const route=fs.readFileSync('app/api/scout-data/route.js','utf8')
  assert.match(route,/shouldUsePublicPayloadCache\(full\)/)
  assert.match(route,/buildPayload\(requested,true\)/)
  assert.doesNotMatch(route,/buildCached\(requested,full\)/)
  assert.doesNotMatch(route,/export const revalidate=/)
  assert.match(route,/const d=full\?await getBacktestOverview\(\):await getBacktestSummary\(\)/)
  const data=fs.readFileSync('lib/data.js','utf8')
  assert.match(data,/async function _getBacktestSummary\(\)/)
  assert.doesNotMatch(data.match(/async function _getBacktestSummary\(\)[\s\S]*?\n}\n/)[0],/scout_replay_players|scout_backtest_players|scout_preseason_player_priors/)


  console.log('scoutApiCache: keyed full payload bypasses public caches')
})().catch(error=>{console.error(error);process.exit(1)})
