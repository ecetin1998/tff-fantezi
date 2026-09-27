const fs=require('node:fs')
const assert=require('node:assert/strict')

const entry=fs.existsSync('proxy.js')?'proxy.js':fs.existsSync('middleware.js')?'middleware.js':null
assert.ok(entry,'Expected proxy.js or middleware.js session-refresh entrypoint.')
const source=fs.readFileSync(entry,'utf8')
const expected=['/squad/:path*','/login/:path*','/reset-password/:path*','/confirm-email/:path*','/auth/:path*','/pricing/:path*']
for(const matcher of expected)assert.equal(source.includes("'"+matcher+"'"),true)
assert.equal(source.includes("'/((?!_next"),false)
for(const publicRoute of ['/players','/points','/matches','/teams','/squads','/availability','/roles','/backtest','/sss']){
  assert.equal(source.includes("'"+publicRoute+"/:path*'"),false)
}
console.log('proxyMatcher: session refresh limited to auth/private surfaces via '+entry)
