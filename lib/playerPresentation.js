export const playerLabel=player=>player?.full_name||player?.display_name||player?.short_label||'—'
export const pitchPlayerLabel=player=>player?.short_label||player?.display_name||player?.full_name||'—'

const confidenceMap={low:'Düşük',medium:'Orta',high:'Yüksek'}

export function confidenceLabel(projection){
  return confidenceMap[String(projection?.confidence||'').toLowerCase()]||'—'
}

export function predictionConfidenceLabel(run,projection){
  const label=confidenceLabel(projection)
  if(label==='—')return label
  return `GW${run?.gameweek||'—'} tahmini · ${label} güven`
}

export function dataAgeHours(run,now=Date.now()){
  if(!run?.source_updated_at)return null
  const ts=new Date(run.source_updated_at).getTime()
  if(!Number.isFinite(ts))return null
  return Math.max(0,(now-ts)/36e5)
}

export function dataFreshnessLabel(run,now=Date.now()){
  const hours=dataAgeHours(run,now)
  if(hours===null)return 'Güncelleme zamanı bilinmiyor'
  if(hours<1)return '1 saatten kısa süre önce güncellendi'
  return `${Math.floor(hours)} saat önce güncellendi`
}

export function fixtureBadge(projection){
  const count=Number(projection?.fixture_count??(projection?.opponent_name?1:0))
  if(count===0)return 'MAÇ YOK'
  if(count>1)return 'ÇİFT MAÇ'
  return null
}
