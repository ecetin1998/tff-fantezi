const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const data=fs.readFileSync('lib/data.js','utf8')
const revalidation=fs.readFileSync('app/api/revalidate/route.js','utf8')
const smoke=fs.readFileSync('scripts/smoke.sh','utf8')

test('model current pointer is a fresh per-request read, never a fixed remote cache key',()=>{
  assert.match(data,/export const getCurrentRun=cache\(_getCurrentRun\)/)
  assert.doesNotMatch(data,/getCurrentRunShared=unstable_cache\(_getCurrentRun/)
  assert.match(data,/const activeRun=await getCurrentRun\(\)/)
  assert.match(data,/getHomeOverviewBaseShared\(activeRun\?\.id\|\|null\)/)
  assert.match(data,/async function _getHomeOverviewBase\(runId\)/)
  assert.match(data,/\.eq\('id',runId\)\.maybeSingle\(\)/)
})

test('each cached public data route is scoped by the live run id',()=>{
  assert.match(data,/const forLiveRun=\(loader\)=>cache\(async\(\.\.\.args\)=>/)
  assert.match(data,/return loader\(run\?\.id\|\|'no-current-run',\.\.\.args\)/)
  for(const name of [
    'getMatches','getRecommendation','getAvailability','getPlayerDetail',
    'getWeeklyPoints','getTeamDetail','getBacktestOverview','getBacktestSummary',
    'getTeamFixturesOverview','getFutureFixturePlan','getModelHealthOverview'
  ]){
    assert.match(data,new RegExp('export const '+name+'=forLiveRun\\('),name+' must be run-scoped')
  }
  assert.match(data,/getRecommendationBundleShared\(runId\)/)
})

test('publishing invalidates rendered site routes as well as data tags',()=>{
  assert.match(revalidation,/revalidateTag\('scout-run','max'\)/)
  assert.match(revalidation,/for\(const path of paths\)revalidatePath\(path\)/)
  for(const page of ['/players','/matches','/squads','/availability','/points']){
    assert.ok(revalidation.includes("'"+page+"'"),'missing invalidate '+page)
  }
  assert.match(smoke,/public API says MH/)
  assert.match(smoke,/rendered HTML uses a different model week/)
  assert.match(smoke,/route-home\.html/)
})
