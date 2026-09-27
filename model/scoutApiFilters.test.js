const assert=require('node:assert/strict')
;(async()=>{
  const {parseScoutQuery,applyScoutFilters}=await import('../lib/scoutApiFilters.mjs')
  let url=new URL('https://example.test/api/scout-data?section=players&team=3&position=DEF&limit=2&fields=id,name')
  const parsed=parseScoutQuery(url)
  assert.equal(parsed.error,undefined)
  assert.equal(parsed.team,3);assert.equal(parsed.position,'DEF');assert.equal(parsed.limit,2)
  const payload={players:[{id:1,name:'A',team_id:3,position:'DEF',price:4},{id:2,name:'B',team_id:4,position:'DEF'},{id:3,name:'C',team_id:3,position:'MID'}]}
  assert.deepEqual(applyScoutFilters(payload,parsed).players,[{id:1,name:'A'}])
  assert.ok(parseScoutQuery(new URL('https://x.test/?limit=501')).error)
  assert.deepEqual(parseScoutQuery(new URL('https://x.test/?wat=1')).unknown,['wat'])
  console.log('scoutApiFilters: query validation/filtering ok')
})().catch(e=>{console.error(e);process.exit(1)})
