import {dataAgeHours,dataFreshnessLabel} from '@/lib/playerPresentation'

export default function DataFreshnessBanner({run,thresholdHours=48}){
  const age=dataAgeHours(run)
  if(age===null||age<=thresholdHours)return null
  return <div className="data-freshness-banner" role="status">
    <b>Veri tazeliği uyarısı</b>
    <span>{dataFreshnessLabel(run)}. Yeni karar vermeden önce son refresh’i kontrol et.</span>
  </div>
}
