/** Turkish-friendly, local-only search across the active player pool. */
export const normalizePlayerSearch=value=>String(value??'').toLocaleLowerCase('tr-TR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i')
  .replace(/[^a-z0-9]+/g,' ').trim()

export function searchComparisonPlayers(players=[],query='',excludedId='',limit=12){
  const needle=normalizePlayerSearch(query)
  const terms=needle.split(' ').filter(Boolean)
  const matched=players.filter(player=>{
    if(!player||String(player.id)===String(excludedId))return false
    const fullName=player.full_name||player.display_name||player.short_label||''
    const haystack=normalizePlayerSearch([fullName,player.display_name,player.short_label,player.team,
      {GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[player.position]||player.position].join(' '))
    return terms.every(term=>haystack.includes(term))
  })
  return {total:matched.length,items:matched.slice(0,Math.max(1,Math.min(30,limit)))}
}
