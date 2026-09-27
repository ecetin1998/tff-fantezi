const assert=require('node:assert/strict')
const fs=require('node:fs')

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'))
const src=fs.readFileSync('lib/observability.js','utf8')
assert.match(src,/console\.error/)

if(pkg.dependencies['@sentry/nextjs']){
  assert.equal(pkg.dependencies['@sentry/nextjs'],'11.0.0')
  assert.match(src,/SENTRY_DSN/)
  assert.match(src,/captureException/)
  console.log('observability contract passed with Sentry')
}else{
  assert.doesNotMatch(src,/@sentry\/nextjs/)
  assert.doesNotMatch(src,/captureException/)
  console.log('observability contract passed with Cloudflare console fallback')
}
