const fs=require('node:fs')
const assert=require('node:assert/strict')

const read=p=>fs.readFileSync(p,'utf8')
const uiFiles=[
  'app/layout.js',
  'app/opengraph-image.js',
  'app/page.js',
  'app/players/page.js',
  'app/players/[id]/page.js',
  'app/points/page.js',
  'app/matches/page.js',
  'app/squads/page.js',
  'app/squad/page.js',
  'app/teams/page.js',
  'app/teams/[id]/page.js',
  'app/roles/page.js',
  'app/pricing/page.js',
  'app/profile/page.js',
  'app/sss/page.js',
  'components/Nav.js',
  'components/AppNavLinks.js',
  'components/NavAccountControls.js',
  'components/AccessGate.js',
  'components/PlayersTable.js',
  'components/SquadBuilder.js',
  'components/TeamsExplorer.js',
  'components/LoginForm.js',
]
const ui=uiFiles.map(read).join('\n')

for(const forbidden of [
  /Fantezi Scout/,
  /Süper Lig Fantasy/,
  /\bFANTASY\b/,
  /clean[ -]sheet/i,
  /Top[-‑]25/,
  /\bTop25\b/,
  /vice-captain/i,
  /Expected Fantasy Points/i,
  /Expected Goals/i,
  /Expected Assists/i,
  /Core xFP/i,
  /Refresh bekliyor/i,
  /HAFTALIK SNAPSHOT/i,
  /PRO •/,
  /FREE ERİŞİMİ/i,
  /→ swap/i,
  /swap başlat/i,
  /puan hit/i,
  /Band dışı/i,
  /Band genişliği/i,
]){
  assert.doesNotMatch(ui,forbidden,'User-facing English term returned: '+forbidden)
}

const home=read('app/page.js')
const nav=read('components/Nav.js')
const pricing=read('app/pricing/page.js')
const matches=read('app/matches/page.js')
const sss=read('app/sss/page.js')
const presentation=read('lib/playerPresentation.js')
const backtest=read('app/backtest/page.js')

assert.match(nav,/Fantezi Rehberi/)
assert.match(nav,/DENEME/)
assert.match(pricing,/GELİŞMİŞ ÜYELİK/)
assert.match(home,/İlk 25/)
assert.match(matches,/gol yememe/i)
assert.match(sss,/FANTEZİ FUTBOL REHBERİ/)
assert.match(sss,/yardımcı kaptan/)
assert.match(sss,/Kalite Kontrolü \/ GEÇTİ/)
assert.match(presentation,/MH\$\{run\?\.gameweek/)
assert.match(presentation,/MAÇ YOK/)
assert.match(presentation,/ÇİFT MAÇ/)
assert.match(backtest,/localizeModelText\(w\.main_learning\)/)
assert.match(backtest,/learningComponentLabel\(item\.component\)/)
assert.match(backtest,/localizeModelText\(item\.summary_tr\|\|item\.signal\)/)
assert.match(backtest,/localizeModelText\(p\.main_error_area\?\?p\.error_component\)/)
assert.doesNotMatch(presentation,/return `GW/)
assert.doesNotMatch(presentation,/return 'BGW'/)
assert.doesNotMatch(presentation,/return 'DGW'/)

console.log('Turkish UI language contract passed')
