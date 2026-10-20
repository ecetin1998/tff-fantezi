import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const surfaces=[
  ['components/PlayersTable.js','Oyuncu Analizi'],
  ['components/SquadBuilder.js','Benim Kadrom oyuncu havuzu'],
  ['components/TeamsExplorer.js','Takımlar'],
  ['components/AvailabilityTable.js','Sakatlık ve Ceza'],
  ['components/WeeklyPointsTable.js','Fantasy Puanları'],
  ['components/TeamRoster.js','Takım oyuncuları']
]

test('all six filtering surfaces use shared accessible multi-checklist',()=>{
  for(const [path,label] of surfaces){
    const source=read(path)
    assert.match(source,/import MultiSelectFilter from/,label)
    assert.match(source,/<MultiSelectFilter/,label)
    assert.match(source,/\.includes\(/,label+' must combine selected values')
  }
})

test('shared checklist stays controlled, keyboard- and screen-reader-friendly',()=>{
  const source=read('components/MultiSelectFilter.js')
  for(const expected of [
    /type="checkbox"/,/checked=\{selectedSet.has\(option.value\)\}/,
    /onChange=\{\(\)=>toggle\(option.value\)\}/,
    /aria-expanded=\{open\}/,/aria-label=\{ariaLabel\|\|placeholder\}/,
    /e.key==='Escape'/,/document.addEventListener\('pointerdown'/,
    /onChange\(\[\]\)/,/onChange\(options.map\(o=>o.value\)\)/,
    /type="search"/
  ])assert.match(source,expected)
})

test('sorting and manager-card selection remain single-choice',()=>{
  const players=read('components/PlayersTable.js')
  const weekly=read('components/WeeklyPointsTable.js')
  const teams=read('components/TeamsExplorer.js')
  const squad=read('components/SquadBuilder.js')
  assert.match(players,/<select className="mobile-sort-select"/)
  assert.match(weekly,/<select className="weekly-sort-select"/)
  assert.match(teams,/<select className="is-active-filter sort-filter"/)
  assert.match(squad,/import ManagerCardPicker from/)
})

test('URL round-trips multiple filters and squad empty slot stays position-scoped',()=>{
  const players=read('components/PlayersTable.js')
  const weekly=read('components/WeeklyPointsTable.js')
  const squad=read('components/SquadBuilder.js')
  assert.match(players,/team:asMulti\(p.get\('team'\)\),pos:asMulti\(p.get\('pos'\)\)/)
  assert.match(players,/asMulti\(next.team\).join\(','\)/)
  assert.match(weekly,/put\('team',team.join\(','\)\)/)
  assert.match(weekly,/put\('pos',pos.join\(','\)\)/)
  assert.match(squad,/setPos\(\[position\]\)/)
})

test('open checklist is layered above filters and scrollable on mobile',()=>{
  const css=read('app/globals.css')
  assert.match(css,/\.multi-filter\.is-open\{z-index:/)
  assert.match(css,/\.multi-filter-panel\{/)
  assert.match(css,/\.multi-filter-options\{[^}]*overflow:auto/)
  assert.match(css,/@media\(max-width:760px\)/)
})
