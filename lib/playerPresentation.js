export const playerLabel=player=>player?.short_label||player?.display_name||player?.full_name||'—'

const confidenceMap={low:'Düşük',medium:'Orta',high:'Yüksek'}

export function predictionConfidenceLabel(run,projection){
  const code=String(projection?.confidence||'').toLowerCase()
  const label=confidenceMap[code]
  if(!label)return '—'
  return `GW${run?.gameweek||'—'} tahmini · ${label} güven`
}
