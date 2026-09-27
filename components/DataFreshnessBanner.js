import {dataAgeHours,dataFreshnessLabel} from '@/lib/playerPresentation'

function refreshTimestamp(run){
  if(!run?.source_updated_at)return 'bilinmiyor'
  const date=new Date(run.source_updated_at)
  if(!Number.isFinite(date.getTime()))return 'bilinmiyor'
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit',
  }).format(date).replace(',', '')
}

export default function DataFreshnessBanner({run,thresholdHours=48}){
  const age=dataAgeHours(run)
  if(age===null||age<=thresholdHours)return null
  const severity=age>96?'critical':'warning'
  return <div className={`data-freshness-banner ${severity}`} role="status">
    <b>Veri tazeliği uyarısı</b>
    <span>Son refresh: {refreshTimestamp(run)} • {dataFreshnessLabel(run)}. Yeni karar vermeden önce son refresh’i kontrol et.</span>
  </div>
}
