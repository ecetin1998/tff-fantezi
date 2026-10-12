const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

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
  assert.match(check,/grep -Fq "\$expected_marker"/)
  assert.match(deploy,/Verify site displays current gameweek/)
  assert.match(deploy,/bash scripts\/verify-published-gameweek\.sh/)
  assert.match(deploy,/workflow_dispatch:/,'Production deploy is still initiated explicitly')
})
