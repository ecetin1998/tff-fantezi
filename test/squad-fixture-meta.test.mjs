import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const presentation=readFileSync('lib/playerPresentation.js','utf8')
const squad=readFileSync('components/SquadBuilder.js','utf8')
const workspace=readFileSync('components/SquadWorkspace.module.css','utf8')
const players=readFileSync('components/PlayersTable.js','utf8')

test('player subtitle includes club, fantasy position, exact opponent and home/away',()=>{
 assert.match(presentation,/export function playerFixtureMeta\(player\)/)
 assert.match(presentation,/export function fixtureOpponentLabel\(projection\)/)
 assert.match(presentation,/GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'/)
 assert.match(presentation,/projection\?\.opponent_name/)
 assert.match(presentation,/projection\?\.venue==='HOME'\?'Ev'/)
 assert.match(presentation,/projection\?\.venue==='AWAY'\?'Dep'/)
 assert.match(presentation,/vs \$\{opponent\}/)
 assert.match(presentation,/club\} • \$\{pos\} • \$\{fixtureOpponentLabel\(player\?\.projection\)\}/)
 assert.match(presentation,/Fikstür bekleniyor/)
})
test('squad uses current run projections in picker, 15-roster, starting XI, bench and captain alternatives',()=>{
 assert.match(squad,/import \{pitchPlayerLabel,playerLabel,playerFixtureMeta\}/)
 const uses=(squad.match(/playerFixtureMeta\(p\)/g)||[]).length
 assert.equal(uses,5)
 assert.match(squad,/className="squad-fixture-meta">\{playerFixtureMeta\(p\)\}/)
 assert.doesNotMatch(squad,/<em>Rakip: \{p\.projection\?\.opponent_name/)
 assert.match(squad,/bench-copy"><b>\{playerLabel\(p\)\}<\/b><small className="squad-fixture-meta">/)
 assert.match(squad,/captain-candidates[\s\S]*?playerFixtureMeta\(p\)/)
})
test('mobile player cards show fixture instead of player role and retain the price elsewhere',()=>{
 assert.match(players,/fixtureBadge,playerLabel,playerFixtureMeta/)
 assert.match(players,/<span>\{playerFixtureMeta\(p\)\}<\/span>/)
 assert.doesNotMatch(players,/p\.team\}\{playerRoleLabel\(p\)\?/)
 assert.match(players,/toplam puan · \{num\(p\.price,1\)\}m/)
})
test('long opponents wrap on compact squad controls instead of being clipped',()=>{
 assert.match(workspace,/\.scope :global\(\.squad-fixture-meta\)/)
 assert.match(workspace,/white-space:normal!important/)
 assert.match(workspace,/overflow-wrap:anywhere/)
 assert.match(workspace,/\.scope :global\(\.picker-copy\)>small:global\(\.squad-fixture-meta\)/)
 assert.match(workspace,/\.scope :global\(\.roster-player\)>small:global\(\.squad-fixture-meta\)/)
})
