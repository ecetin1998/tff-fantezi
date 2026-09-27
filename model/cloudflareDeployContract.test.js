const fs=require('node:fs')
const assert=require('node:assert/strict')

const deploy=fs.readFileSync('.github/workflows/cloudflare-deploy.yml','utf8')
const smoke=fs.readFileSync('.github/workflows/post-deploy-smoke.yml','utf8')
const health=fs.readFileSync('app/api/health/route.js','utf8')
const wrangler=fs.readFileSync('wrangler.jsonc','utf8')

assert.match(deploy,/Cloudflare Workers deploy/)
assert.match(deploy,/npm run deploy/)
assert.match(deploy,/GITHUB_SHA/)
assert.match(deploy,/tff-fantezi\.ecetin1998\.workers\.dev/)
assert.match(smoke,/EXPECTED_SHA/)
assert.match(smoke,/workflow_run\.head_sha/)
assert.match(health,/NEXT_PUBLIC_BUILD_SHA/)
assert.match(health,/Cache-Control':'no-store/)
assert.match(wrangler,/"name": "tff-fantezi"/)

console.log('cloudflare deploy contract passed')
