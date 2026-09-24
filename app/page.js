import Link from 'next/link'
import { getMatches, getPlayersWithProjection } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

export default async function Home(){
  const [{players,run},{matches}]=await Promise.all([getPlayersWithProjection(),getMatches()])
  const best=[...players].sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))[0]
  const value=[...players].sort((a,b)=>Number(b.projection?.value_score||0)-Number(a.projection?.value_score||0))[0]
  const mins=[...players].sort((a,b)=>Number(b.projection?.x_minutes||0)-Number(a.projection?.x_minutes||0))[0]
  const six=[...players].sort((a,b)=>Number(b.projection?.six_plus_probability||0)-Number(a.projection?.six_plus_probability||0))[0]
  const updated=run?.source_updated_at?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(run.source_updated_at)):'—'
  const highlights=[
    [`MH${run?.gameweek||'—'} xFP lideri`,best,Number(best?.projection?.xfp||0).toFixed(2),'xFP'],
    [`MH${run?.gameweek||'—'} en iyi F/P`,value,Number(value?.projection?.value_score||0).toFixed(2),'xFP/m'],
    [`MH${run?.gameweek||'—'} en güvenli dakika`,mins,Number(mins?.projection?.x_minutes||0).toFixed(0),'dk'],
    [`MH${run?.gameweek||'—'} 6+ puan ihtimali`,six,(Number(six?.projection?.six_plus_probability||0)*100).toFixed(0),'%'],
  ]
  return <>
    <section className="home-intro-layout">
      <div className="card home-intro-hero">
        <span className="eyebrow">SÜPER LİG FANTASY ANALİZ PLATFORMU</span>
        <h1>Veriyi oku.<br/><span>Kararı sen ver.</span></h1>
        <p>Fantezi Scout; oyuncu rolü, dakika ihtimali, maç modeli ve fantezi puan dağılımını tek yerde birleştirir. Amaç tek bir “doğru kadro” söylemek değil; karar verirken ihtiyacın olan resmi görünür yapmak.</p>
        <div className="home-intro-actions">
          <Link href="/players" className="cta">Oyuncu Analizleri</Link>
          <Link href="/squad" className="secondary">Benim Kadrom</Link>
          <Link href="/matches" className="text-action">Maç Tahminleri →</Link>
        </div>
      </div>
      <aside className="home-highlight-grid">
        {highlights.map(([label,p,val,unit])=><Link key={label} className="card spotlight-card team-accent-card" style={teamCssVars(p?.team)} href={p?'/players/'+p.id:'/players'}>
          <span>{label}</span><b>{p?.full_name||'—'}</b><small>{p?.team||'—'}</small><strong>{val} <em>{unit}</em></strong>
        </Link>)}
        <div className="card spotlight-card home-status-card home-status-week">
          <span>Güncel hafta</span>
          <b>MH{run?.gameweek||'—'}</b>
          <small>{matches.length} maç • {players.length} oyuncu</small>
          <strong>Aktif <em>hafta</em></strong>
        </div>
        <div className="card spotlight-card home-status-card home-status-ready">
          <span>Model durumu</span>
          <b>Model hazır</b>
          <small>Son veri {updated}</small>
          <strong>Güncel <em>veri</em></strong>
        </div>
      </aside>
    </section>

    <section className="card home-model-guide">
      <div className="home-guide-copy"><span className="eyebrow">MODELİ NASIL OKUYACAKSIN?</span><h2>Tek sayıya değil, dağılıma bak.</h2><p>xFP başlangıç noktasıdır. Dakika, ilk 11 ihtimali, taban/tavan ve maç bağlamını birlikte okumak daha doğru karar verir.</p></div>
      <div className="home-guide-metrics">
        <div><b>xFP</b><span>Beklenen fantezi puanı</span></div>
        <div><b>xDakika</b><span>Beklenen oynama süresi</span></div>
        <div><b>Tavan</b><span>Üst %10'luk puan senaryosu</span></div>
        <div><b>6+%</b><span>Güçlü fantezi dönüş ihtimali</span></div>
      </div>
    </section>

    <section className="home-feature-grid">
      <Link href="/players" className="card home-feature-card"><b>Oyuncu Analizleri</b><p>Tam ad, takım, rakip, rol, dakika, xFP ve gerçek haftalık performansı birlikte gör.</p><span>Oyuncu havuzu →</span></Link>
      <Link href="/teams" className="card home-feature-card"><b>Takım Profilleri</b><p>Takım renkleri, kadro, geçmiş sonuçlar, xG/xGA profili ve bu haftaki eşleşme.</p><span>Takım analizleri →</span></Link>
      <Link href="/squad" className="card home-feature-card"><b>Benim Kadrom</b><p>15 oyuncunu sahaya diz, kaptanı seç, yedeklerle dinamik swap yap ve taktiği canlı gör.</p><span>Benim Kadrom →</span></Link>
    </section>
  </>
}
