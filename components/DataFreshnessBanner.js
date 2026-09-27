import {dataAgeHours,dataFreshnessLabel} from '@/lib/playerPresentation'

function refreshStamp(run){
  if(!run?.source_updated_at)return 'bilinmiyor'
  const d=new Date(run.source_updated_at)
  if(!Number.isFinite(d.getTime()))return 'bilinmiyor'
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(d).replace(',', '')
}

export default function DataFreshnessBanner({run,thresholdHours=48}){
  const age=dataAgeHours(run)
  if(age===null||age<=thresholdHours)return null
  const severity=age>96?'critical':'warning'
  return <div className={`data-freshness-banner ${severity}`} role="status">
    <b>{severity==='critical'?'Veri çok bayat':'Veri tazeliği uyarısı'}</b>
    <span>{dataFreshnessLabel(run)} • Son refresh: {refreshStamp(run)}.</span>
  </div>
}
