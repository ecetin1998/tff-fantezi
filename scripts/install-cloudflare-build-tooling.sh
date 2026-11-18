#!/usr/bin/env bash
set -euo pipefail

# The runtime packages are intentionally kept out of the application lockfile.
# The npm registry advertised @aws-sdk/middleware-location-constraint@3.972.56
# during deploy #377, but its tarball returned 404. Force a published version
# for *transitive* OpenNext/Wrangler dependencies before their resolution.
# npm pkg set edits package.json on the ephemeral Actions runner only;
# --package-lock=false keeps the checked-in application lockfile immutable.
npm pkg set 'overrides.@aws-sdk/middleware-location-constraint=3.972.55'

npm install --no-save --package-lock=false --no-audit --no-fund \
  @opennextjs/cloudflare@1.20.6 \
  wrangler@4.142.0 \
  @opentelemetry/api@1.9.1

test -x node_modules/.bin/opennextjs-cloudflare
test -x node_modules/.bin/wrangler

# Fail loudly if npm ignored the exact dependency resolution guard.
node <<'NODE'
const fs = require('node:fs')
const assert = require('node:assert/strict')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.equal(packageJson.overrides['@aws-sdk/middleware-location-constraint'], '3.972.55')
const middleware = 'node_modules/@aws-sdk/middleware-location-constraint/package.json'
if (fs.existsSync(middleware)) {
  const resolved = JSON.parse(fs.readFileSync(middleware, 'utf8'))
  assert.equal(resolved.version, '3.972.55')
  console.log('Cloudflare AWS SDK middleware pinned:', resolved.version)
}
console.log('Cloudflare tooling installation verified.')
NODE
