const fs=require('node:fs')
const assert=require('node:assert/strict')

const proxy=fs.readFileSync('middleware.js','utf8')
const expected=['/squad/:path*','/login/:path*','/reset-password/:path*','/confirm-email/:path*','/auth/:path*','/pricing/:path*']
for(const matcher of expected)assert.equal(proxy.includes("'"+matcher+"'"),true)
assert.equal(proxy.includes("'/((?!_next"),false)
for(const publicRoute of ['/players','/points','/matches','/teams','/squads','/availability','/roles','/backtest','/sss']){
  assert.equal(proxy.includes("'"+publicRoute+"/:path*'"),false)
}
console.log('middleware matcher: session refresh limited to auth/private surfaces')
