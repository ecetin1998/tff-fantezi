import AvailabilityTable from '@/components/AvailabilityTable'
import { getAvailability } from '@/lib/data'

export const revalidate=300

const formatSourceTime=value=>{
  if(!value)return null
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(new Date(value)).replace(',', '')
}

export default async function Availability(){
  const {run,rows}=await getAvailability()
  const latestSource=[...(rows||[])]
    .map(r=>r.detail_source_updated_at)
    .filter(Boolean)
    .sort((a,b)=>new Date(b)-new Date(a))[0]

  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">SAKATLIK & CEZA</span>
        <h1>MH{run?.gameweek||'—'} Durum Takibi</h1>
      </div>
      <span className="muted">
        {rows.length} kayıt{latestSource?' • detaylı kaynak '+formatSourceTime(latestSource):''}
      </span>
    </div>
    <AvailabilityTable rows={rows}/>
  </>
}
