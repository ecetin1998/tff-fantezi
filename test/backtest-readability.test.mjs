import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const css=readFileSync('components/AnalysisViews.module.css','utf8')
const layout=readFileSync('app/backtest/layout.js','utf8')
const tokens=readFileSync('app/globals.css','utf8')

test('model performance typography is scoped to admin backtest page',()=>{
  assert.match(layout,/analysisViews\.scope/)
  assert.match(tokens,/--type-caption:11px;--type-label:12px/)
  const section=css.slice(css.indexOf('/* P1: backtest readability and accessible type sizes'))
  assert.ok(section.length>2000,'Backtest readability block must exist')
  assert.match(section,/\.scope :global\(\.backtest-page\) :global\(\.backtest-explainer\) p/)
  assert.match(section,/font-size:var\(--type-label\)/)
  assert.match(section,/font-size:var\(--type-caption\)/)
  assert.doesNotMatch(section,/font-size:\s*[0-8](?:\.\d+)?px\b/)
})
test('tables remain scrollable and mobile model badge wraps without overflow',()=>{
  const section=css.slice(css.indexOf('/* P1: backtest readability and accessible type sizes'))
  assert.match(section,/\.scope :global\(\.backtest-page\) :global\(\.table-scroll\)\{[\s\S]*?overflow-x:auto/)
  assert.match(section,/@media\(max-width:620px\)\{[\s\S]*?\.scope :global\(\.backtest-page\) :global\(\.backtest-live-badge\)\{[\s\S]*?flex-direction:column/)
  assert.match(section,/overflow-wrap:anywhere/)
  assert.match(section,/min-width:740px/)
})
