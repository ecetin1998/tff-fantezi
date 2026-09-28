const fs=require('node:fs')
const path=require('node:path')
const assert=require('node:assert/strict')

const root=path.resolve(__dirname,'..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')

const presentation=read('lib/playerPresentation.js')
assert.match(
  presentation,
  /playerLabel=player=>player\?\.full_name\|\|player\?\.display_name\|\|player\?\.short_label/,
  'Non-pitch player labels must prefer full_name.'
)
assert.match(
  presentation,
  /pitchPlayerLabel=player=>player\?\.short_label\|\|player\?\.display_name\|\|player\?\.full_name/,
  'Pitch labels must prefer short_label.'
)

for(const file of ['components/SquadPitchView.js','components/SquadBuilder.js']){
  const source=read(file)
  assert.match(source,/pitchPlayerLabel/,file+' must use the pitch-only label helper.')
  assert.match(source,/function displayName\(player\)\{ return pitchPlayerLabel\(player\) \}/,file+' pitch displayName must stay short.')
}

const pitchView=read('components/SquadPitchView.js')
assert.doesNotMatch(pitchView,/Alternatif \(tavan\) kaptan:/,'Recommended squad card must not show the ceiling-captain note.')
assert.doesNotMatch(pitchView,/ceiling-captain-note/,'Removed ceiling-captain note markup must not return.')

const builder=read('components/SquadBuilder.js')
assert.match(builder,/picker-copy[\s\S]{0,120}<b>\{playerLabel\(p\)\}<\/b>/,'Picker must use full player names.')
assert.match(builder,/bench-copy"><b>\{playerLabel\(p\)\}<\/b>/,'Bench must use full player names.')
assert.match(builder,/captain-candidates[\s\S]{0,500}<b>\{playerLabel\(p\)\}<\/b>/,'Captain candidates must use full player names.')
assert.match(builder,/captain-impact[\s\S]{0,220}<b>\{playerLabel\(xi\.find/,'Selected captain must use the full player name.')

for(const file of ['app/page.js','app/players/page.js','app/matches/page.js']){
  assert.doesNotMatch(read(file),/DataFreshnessBanner/,file+' must not restore the repetitive stale-data banner.')
}

assert.equal(
  fs.existsSync(path.join(root,'components/DataFreshnessBanner.js')),
  false,
  'The removed stale-data banner component must not be reintroduced accidentally.'
)

const roleLabels=read('lib/playerRole.js')
for(const label of ['Kanat Bek','Ön Libero','Merkez Orta Saha','Ofansif Orta Saha','Kenar Orta Saha','İkinci Forvet']){
  assert.match(roleLabels,new RegExp(label),'Detailed roles must use canonical title-case Turkish labels.')
}
assert.match(roleLabels,/L:'Sol'/)
assert.match(roleLabels,/R:'Sağ'/)
assert.doesNotMatch(roleLabels,/toLocaleLowerCase/,'Role labels must not be lower-cased ad hoc.')

const playersTable=read('components/PlayersTable.js')
assert.doesNotMatch(playersTable,/confidenceLabel/,'Player list must not show low/medium/high confidence labels.')
assert.doesNotMatch(playersTable,/>\{confidenceLabel\(p\.projection\)\} güven</,'Player cards must stay free of confidence text.')

console.log('player presentation contract passed')
