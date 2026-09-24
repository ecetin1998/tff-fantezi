import { getModelOverview } from '@/lib/data'
export const revalidate=300
export default async function Model(){
  const {run,confidence,counts}=await getModelOverview()
  const fmt=d=>d?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(d)):'—'
  return <><div className="section-title"><div><span className="eyebrow">MODEL & GÜVEN</span><h1>Model Durumu</h1></div><span className="pill good">{run?.status||'—'}</span></div>
  <div className="grid stats model-stats">
    <div className="card stat"><span>Aktif hafta</span><strong>MH{run?.gameweek||'—'}</strong><em>{run?.model_version||'—'}</em></div>
    <div className="card stat"><span>Simülasyon</span><strong>{Number(run?.simulation_count||0).toLocaleString('tr-TR')}</strong><em>Monte Carlo</em></div>
    <div className="card stat"><span>Oyuncu tahmini</span><strong>{counts.projectionCount||0}</strong><em>aktif projeksiyon</em></div>
    <div className="card stat"><span>Maç modeli</span><strong>{counts.matchCount||0}</strong><em>fikstür</em></div>
  </div>
  <div className="split">
    <section className="card panel"><span className="eyebrow">GÜNCELLİK</span><h2>Veri zamanları</h2><div className="detail-list"><div><span>Model üretimi</span><b>{fmt(run?.generated_at)}</b></div><div><span>Kaynak güncellemesi</span><b>{fmt(run?.source_updated_at)}</b></div><div><span>Sakatlık/Ceza kaydı</span><b>{counts.availabilityCount||0}</b></div><div><span>Rol sinyali</span><b>{counts.roleCount||0}</b></div></div></section>
    <section className="card panel"><span className="eyebrow">VERİ GÜVENİ</span><h2>Projeksiyon dağılımı</h2><div className="detail-list">{Object.entries(confidence).sort((a,b)=>b[1]-a[1]).map(([k,v])=><div key={k}><span>{k}</span><b>{v} oyuncu</b></div>)}</div></section>
  </div></>
}