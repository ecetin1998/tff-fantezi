// The room's fixture is frozen at draft creation; do not use the site's current week.
const positions={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}

export function draftFixtureMeta(player){
  const club=player?.team||'—'
  const position=positions[player?.position]||player?.position||'—'
  const opponent=String(player?.fixture_opponent||'').trim()
  const venue=['Ev','Dep'].includes(player?.fixture_venue)?player.fixture_venue:null
  return `${club} · ${position} · ${opponent&&venue?`vs ${opponent} (${venue})`:'Fikstür bekleniyor'}`
}
