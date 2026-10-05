const fs=require('node:fs')
const assert=require('node:assert/strict')

const config=JSON.parse(fs.readFileSync('vercel.json','utf8'))
assert.equal(
  config?.git?.deploymentEnabled,
  false,
  'Vercel Git deployments must stay disabled because Cloudflare Workers is production.'
)

const workflows=fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/i.test(x))
for(const file of workflows){
  const content=fs.readFileSync('.github/workflows/'+file,'utf8')
  assert.doesNotMatch(content,/vercel\s+(deploy|build)|npx\s+vercel|VERCEL_TOKEN/i,file+' must not deploy to Vercel directly')
}

console.log('Vercel previews skipped while main production deploys remain enabled')
