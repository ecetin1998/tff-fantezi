import AvailabilityTable from '@/components/AvailabilityTable'
import { getAvailability } from '@/lib/data'

export const revalidate=300

export default async function Availability(){
  const {run,rows}=await getAvailability()
  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">SAKATLIK & CEZA</span>
        <h1>MH{run?.gameweek||'—'} Durum Takibi</h1>
      </div>
      <span className="muted">{rows.length} kayıt</span>
    </div>
    <AvailabilityTable rows={rows}/>
  </>
}
