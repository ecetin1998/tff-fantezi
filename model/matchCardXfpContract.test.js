const fs=require('node:fs')
const assert=require('node:assert/strict')

const data=fs.readFileSync('lib/data.js','utf8')
const page=fs.readFileSync('app/matches/page.js','utf8')
const css=fs.readFileSync('components/DataViews.module.css','utf8')

assert.match(data,/total_xfp:rows\.reduce\(\(sum,p\)=>sum\+Number\(p\.xfp\|\|0\),0\)/)
assert.match(data,/top_player:ranked\[0\]\|\|null/)
assert.match(data,/name:displayName\(p\)/,'Match fantasy leaders must use the off-pitch full-name helper.')
assert.match(page,/match-team-xfp-strip/)
assert.match(page,/homeFantasy\.total_xfp/)
assert.match(page,/awayFantasy\.total_xfp/)
assert.match(page,/homeFantasy\.top_player/)
assert.match(page,/awayFantasy\.top_player/)
assert.match(page,/En yüksek xFP/)
assert.doesNotMatch(page,/short_label/,'Match cards must not render short player labels.')

assert.match(css,/\.scope :global\(\.match-analysis-card\)\{[\s\S]*?height:570px;/)
assert.match(css,/\.scope :global\(\.match-analysis-card\):has\(:global\(\.match-technical-details\)\[open\]\)/)
assert.match(css,/\.scope :global\(\.match-team-xfp-strip\)/)
assert.match(css,/-webkit-line-clamp:5/)

console.log('match card team xFP contract ok')
