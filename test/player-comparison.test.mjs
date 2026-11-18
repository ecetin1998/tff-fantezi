import test from 'node:test'
import assert from 'node:assert/strict'
import {comparePlayerMetrics} from '../lib/playerComparison.mjs'

const a={id:1,price:8,active:true,total_points:49,projection:{xfp:5.22,xi_probability:.7,x_minutes:72,value_score:.65,availability_probability:1,p90:11,six_plus_probability:.4}}
const b={id:2,price:6,active:true,total_points:50,projection:{xfp:4.8,xi_probability:.82,x_minutes:78,value_score:.8,availability_probability:.9,p90:10,six_plus_probability:.5}}
test('free comparison never includes Pro P90 and 6+ probability',()=>{
 const rows=comparePlayerMetrics(a,b,{isPro:false,proReady:true})
 assert.equal(rows.length,7)
 assert.equal(rows.some(r=>r.key==='p90'||r.key==='six'),false)
 assert.equal(rows.find(r=>r.key==='price').better,'right')
 assert.equal(rows.find(r=>r.key==='xfp').better,'left')
})
test('Pro statistics appear only after live authenticated overlay is ready',()=>{
 assert.equal(comparePlayerMetrics(a,b,{isPro:true,proReady:false}).length,7)
 assert.equal(comparePlayerMetrics(a,b,{isPro:true,proReady:true}).length,9)
})
test('unknown and missing values are not converted into zero',()=>{
 const rows=comparePlayerMetrics({...a,projection:{xfp:null}},b)
 assert.equal(rows.find(r=>r.key==='xfp').first,'—')
 assert.equal(rows.find(r=>r.key==='xfp').better,'tie')
 assert.equal(comparePlayerMetrics(a,a).length,0)
 assert.equal(comparePlayerMetrics(a,null).length,0)
})

test('comparison UI stays compact, accessible and uses existing permission-gated metrics',async()=>{
 const {readFileSync}=await import('node:fs')
 const {fileURLToPath}=await import('node:url')
 const {dirname,resolve}=await import('node:path')
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
 const ui=readFileSync(resolve(root,'components/PlayerComparison.js'),'utf8')
 const css=readFileSync(resolve(root,'components/PlayerComparison.module.css'),'utf8')
 assert.match(ui,/aria-labelledby="compare-title"/)
 assert.match(ui,/<label htmlFor=\{selectId\}>/)
 assert.match(ui,/searchComparisonPlayers\(list,query,otherId,10\)/)
 assert.match(ui,/role="combobox"/)
 assert.match(ui,/role="listbox"/)
 assert.match(ui,/role="option"/)
 assert.match(ui,/event.key==='ArrowDown'/)
 assert.match(ui,/event.key==='Enter'/)
 assert.match(ui,/comparePlayerMetrics\(first,second,\{isPro,proReady\}\)/)
 assert.match(ui,/<table className=\{styles.metrics\}/)
 assert.match(ui,/row\.better==='left'/)
 assert.match(ui,/row\.better==='right'/)
 assert.match(ui,/playerFixtureMeta\(player\)/)
 assert.doesNotMatch(ui,/<details/)
 assert.match(css,/\.panel:global\(\.card\)\s*\{\s*display:block;/)
 assert.match(css,/@media\(max-width:620px\)/)
 assert.match(css,/\.pickerGrid\{grid-template-columns:minmax\(0,1fr\)/)
})
