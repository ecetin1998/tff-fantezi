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

console.log('player presentation contract passed')
