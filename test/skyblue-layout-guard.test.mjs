import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const builder=readFileSync('components/SquadBuilder.js','utf8')
const layout=readFileSync('app/layout.js','utf8')
const css=readFileSync('components/LayoutAudit.module.css','utf8')

test('player picker uses identity / facts / xFP / action as separate groups',()=>{
  assert.match(builder,/className="picker-player-content"/)
  assert.match(builder,/className="picker-player-identity"/)
  assert.match(builder,/className="picker-player-facts"/)
  assert.match(builder,/picker-player picker-player-v3/)
  assert.match(builder,/className={`picker-value xfp/)
  assert.match(builder,/aria-label={chosen\?'Oyuncuyu kadrodan çıkar':'Oyuncuyu kadroya ekle'}/)
  assert.ok(!/className={`picker-value points[^\n]+\n\s+<button/.test(builder),'points should not be a direct column before action')
})

test('layout guard loaded after Sky Blue theme on every route',()=>{
  const sky=layout.indexOf('skyBlueTheme.scope')
  const guard=layout.indexOf('layoutAudit.scope')
  assert.ok(sky>=0 && guard>sky)
  assert.match(css,/picker-player-v3/)
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 53px 36px !important/)
  assert.match(css,/picker-player-facts/)
  assert.match(css,/picker-value\):global\(\.xfp\)::after\{\s*content:none !important/)
})

test('mobile sorter has four equal buttons on one row',()=>{
  assert.match(css,/\.picker-table-head\)\{\s*display:grid;/)
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important/)
  assert.match(css,/picker-table-head\)>button\{[\s\S]*?min-width:0/)
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 48px 34px !important/)
})

test('main route groups and mobile footer have overflow protection',()=>{
  for(const name of ['home-shell','home-highlight-grid','home-feature-grid','modern-match-grid','my-squad-layout','unified-squad-list']){
    assert.ok(css.includes(':global(.'+name+')'),name+' should be covered')
  }
  assert.match(css,/padding-bottom:calc\(100px \+ env\(safe-area-inset-bottom\)\)/)
})
