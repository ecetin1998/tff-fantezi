const fs=require('node:fs')
const assert=require('node:assert/strict')

assert.equal(fs.existsSync('proxy.js'),false,'Global auth proxy should stay removed: route handlers/pages enforce auth and OpenNext Node proxy adds an unnecessary request/bundle.')
assert.equal(fs.existsSync('middleware.js'),false,'Legacy middleware must not return.')
console.log('proxyMatcher: no global auth middleware/proxy; auth remains route-scoped')
