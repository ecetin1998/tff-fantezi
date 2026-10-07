import AvailabilityTable from '@/components/AvailabilityTable'
import AccessGate from '@/components/AccessGate'
import { getAuthState, getAvailability } from '@/lib/data'

export const metadata={title:'Sakatlık ve Ceza Durumu'}

export const revalidate=300

export default async function Availability(){
  const [auth,{run,rows}]=await Promise.all([getAuthState(),getAvailability()])
  const visibleRows=auth.tier==='visitor'?rows.slice(0,8):rows
  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">SAKATLIK & CEZA</span>
        <h1>MH{run?.gameweek||'—'} Durum Takibi</h1>
      </div>
      <span className="muted">{auth.tier==='visitor'?visibleRows.length+'/'+rows.length+' önizleme':rows.length+' kayıt'}</span>
    </div>
    <AvailabilityTable rows={visibleRows} freshnessAt={run?.availability_checked_at||null}/>
    {auth.tier==='visitor'&&rows.length>visibleRows.length?<AccessGate
      compact
      tier="member"
      eyebrow="ÜCRETSİZ ÜYELİK"
      title="Tüm sakatlık ve ceza listesini aç."
      description="Ücretsiz hesapla güncel uygunluk listesinin tamamını ve Benim Kadrom alanını kullanabilirsin."
    />:null}
  </>
}
