const fs=require('node:fs')
const assert=require('node:assert/strict')

const config=JSON.parse(fs.readFileSync('vercel.json','utf8'))
assert.deepEqual(
  config?.git?.deploymentEnabled,
  {'*':false,main:true},
  'Vercel Git deployments must be restricted to main only'
)
assert.match(
  String(config?.ignoreCommand||''),
  /VERCEL_GIT_COMMIT_REF.*main/,
  'Non-main Git deployments must exit through the ignored-build step before consuming a preview build.'
)

const workflows=fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/i.test(x))
for(const file of workflows){
  const content=fs.readFileSync('.github/workflows/'+file,'utf8')
  assert.doesNotMatch(content,/vercel\s+(deploy|build)|npx\s+vercel|VERCEL_TOKEN/i,file+' must not deploy to Vercel directly')
}

console.log('Vercel Git deployments enabled for main only')
