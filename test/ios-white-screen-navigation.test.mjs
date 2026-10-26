import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const nav=read('components/AppNavLinks.js')
const loading=read('app/loading.js')
const routeError=read('app/error.js')
const globalError=read('app/global-error.js')

test('iPhone mobile menus use normal document navigation and disable speculative RSC prefetch',()=>{
  assert.match(nav,/function navigateMobileDocument\(event,href\)/)
  assert.match(nav,/event\.preventDefault\(\)/)
  assert.match(nav,/window\.location\.assign\(target\.pathname\+target\.search\+target\.hash\)/)
  assert.match(nav,/<Link prefetch=\{false\} onClick=\{\(event\)=>\{onClick\?\.\(event\);navigateMobileDocument\(event,href\)\}\}/)
  assert.match(nav,/<Link prefetch=\{false\} onClick=\{\(event\)=>navigateMobileDocument\(event,href\)\}/)
  assert.match(nav,/event\.metaKey\|\|event\.ctrlKey\|\|event\.shiftKey\|\|event\.altKey/)
  // Desktop navigation and links to game pages are unaffected.
  assert.match(nav,/export function DesktopNavLinks/)
})
test('slow routes have visible loading text rather than a textless white skeleton',()=>{
  assert.match(loading,/Sayfa yükleniyor/)
  assert.match(loading,/role="status"/)
  assert.match(loading,/aria-live="polite"/)
})
test('page and root errors offer a retry/reload instead of a blank surface',()=>{
  assert.match(routeError,/role="alert"/)
  assert.match(routeError,/onClick=\{\(\)=>reset\(\)\}/)
  assert.match(routeError,/window\.location\.reload\(\)/)
  assert.match(globalError,/role="alert"/)
  assert.match(globalError,/<html lang="tr">/)
  assert.match(globalError,/onClick=\{\(\)=>reset\(\)\}/)
})
