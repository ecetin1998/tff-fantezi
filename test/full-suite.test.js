const {test}=require('node:test')
const {spawnSync}=require('node:child_process')
const path=require('node:path')
const assert=require('node:assert/strict')

const root=path.resolve(__dirname,'..')
const jsTests=[
  'model/attackAllocation.test.js',
  'model/simulateScout.test.js',
  'model/replayAudit.test.js',
  'model/publicReadCompatibility.test.js',
  'model/auditHardening.test.js',
  'model/scoutApiCache.test.js',
  'model/scoutFeedStructure.test.js',
  'model/smokeContract.test.js',
  'model/proxyMatcher.test.js',
  'model/routeRuntimeContract.test.js',
  'model/rulesParity.test.js',
  'model/dataQualityContract.test.js',
  'model/scoutApiFilters.test.js',
  'model/observability.test.js',
  'model/playerPresentationContract.test.js',
  'model/fullAuditContract.test.js',
  'model/cloudflareDeployContract.test.js',
]

for(const file of jsTests){
  test(file,{concurrency:false},()=>{
    const result=spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8'})
    assert.equal(result.status,0,[result.stdout,result.stderr].filter(Boolean).join('\n'))
  })
}

test('model/optimizer_rules_test.py',{concurrency:false},()=>{
  const result=spawnSync('python3',['-m','pytest','-q','model/optimizer_rules_test.py'],{cwd:root,encoding:'utf8'})
  assert.equal(result.status,0,[result.stdout,result.stderr].filter(Boolean).join('\n'))
})
