const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {spawnSync}=require('node:child_process')

const read=path=>fs.readFileSync(path,'utf8')

test('all critical model-week public pages bypass stale ISR/R2 HTML',()=>{
  for(const route of ['players','matches','squads']){
    const page=read('app/'+route+'/page.js')
    assert.match(page,/export const dynamic='force-dynamic'/,route+' must render the current model week each request')
    assert.doesNotMatch(page,/export const revalidate=300/,route+' must not publish a 300-second static model week')
    assert.match(page,/MH\{(?:run|rec\.run)\?\.gameweek\|\|'—'\}/,route+' must display actual live gameweek')
  }
  assert.match(read('app/page.js'),/export const dynamic='force-dynamic'/,'Home remains dynamic')
})

test('model promotion invalidates rendered HTML as well as its data-cache tag',()=>{
  const route=read('app/api/revalidate/route.js')
  assert.match(route,/revalidateTag\('scout-run','max'\)/)
  for(const p of ['/','/players','/matches','/squads','/availability','/points','/teams']){
    assert.ok(route.includes("'"+p+"'"),'missing route revalidation '+p)
  }
  assert.match(route,/revalidatePath\(route\)/)
  assert.match(route,/revalidatePath\('\/players\/\[id\]','page'\)/)
  assert.match(route,/revalidatePath\('\/teams\/\[id\]','page'\)/)
  assert.match(route,/timingSafeEqual/,'Revalidation must still require the existing secret')
})

test('production deployment must fail if API says MH8 while any real HTML shows MH7',()=>{
  const check=read('scripts/verify-published-gameweek.sh')
  const deploy=read('.github/workflows/cloudflare-deploy.yml')
  assert.match(check,/EXPECTED_GAMEWEEK/)
  assert.match(check,/\.current_run\.gameweek/)
  assert.match(check,/\.current_run\.is_current == true/)
  for(const route of ['home','players','matches','squads']){
    assert.ok(check.includes(route+':'),route+' must be present in the verifier')
  }
  assert.match(check,/expected_marker="MH\$EXPECTED_GAMEWEEK \$label"/)
  assert.ok(check.includes('python3 scripts/check-rendered-week.py'), 'Rendered SSR text is checked rather than raw byte grep.')
  assert.match(deploy,/Verify site displays current gameweek/)
  assert.match(deploy,/bash scripts\/verify-published-gameweek\.sh/)
  assert.match(deploy,/workflow_dispatch:/,'Production deploy is still initiated explicitly')
})

test('React 19 MH titles are checked as visible SSR text, not exact HTML bytes',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mh-html-'))
  const check=(markup,expected)=>{
    const file=path.join(temp,'page.html')
    fs.writeFileSync(file,markup,'utf8')
    return spawnSync('python3',['scripts/check-rendered-week.py',file,expected],{encoding:'utf8'})
  }
  try{
    const hydrated='<html><head><script>window.x="MH7 Oyuncu Analizi"</script></head><body><h1>MH<!-- -->8<!-- --> Oyuncu Analizi</h1></body></html>'
    assert.equal(check(hydrated,'MH8 Oyuncu Analizi').status,0,'Split React dynamic gameweek must PASS.')
    assert.notEqual(check(hydrated,'MH7 Oyuncu Analizi').status,0,'Old week only in scripts must fail.')
    assert.equal(check('<h1>MH<!-- -->8<!-- --> Maç Tahminleri</h1>','MH8 Maç Tahminleri').status,0)
    assert.equal(check('<h1>MH<!-- -->8<!-- --> Kadro Önerileri</h1>','MH8 Kadro Önerileri').status,0)
    assert.notEqual(check('<h1>MH7 Oyuncu Analizi</h1>','MH8 Oyuncu Analizi').status,0)
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
})

test('read-only live week probe uses the same React 19 SSR parser as production deploy',()=>{
  const workflow=read('.github/workflows/mh8-live-probe.yml')
  assert.match(workflow,/uses: actions\/checkout@v4/,'Read-only probe must check out the exact verifier code')
  assert.match(workflow,/bash scripts\/verify-published-gameweek\.sh/,'Avoid a second brittle HTML parser')
  assert.match(workflow,/EXPECTED_GAMEWEEK=/,'The verifier must check the current live API gameweek')
  assert.doesNotMatch(workflow,/re\.sub\('<\[\^>\]\+>'/,'Do not split React streaming comments with tag-stripping regex')
  assert.doesNotMatch(workflow,/wrangler deploy|npm run deploy/,'This workflow must never publish')
})
