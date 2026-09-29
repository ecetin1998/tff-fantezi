import Link from 'next/link'
import { getHomeOverview } from '@/lib/data'
import { teamCssVars, teamHref } from '@/lib/teamThemes'
import {playerLabel} from '@/lib/playerPresentation'

export const revalidate=300

export default async function Home(){
  const {run,best,value,teamXfpLeader,top25,playerCount,matchCount}=await getHomeOverview()
  const latestDataAt=run?.latest_data_at||run?.source_updated_at||null
  const sourceUpdated=latestDataAt?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(latestDataAt)):'—'
  const modelUpdated=run?.generated_at?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(run.generated_at)):'—'
  const sourceAgeHours=latestDataAt?Math.max(0,(Date.now()-new Date(latestDataAt).getTime())/36e5):Infinity
  const sourceFresh=sourceAgeHours<=24
  const freshnessLabel=!Number.isFinite(sourceAgeHours)?'Bilinmiyor':sourceAgeHours<1?'1 saatten yeni':sourceAgeHours<24?`${Math.round(sourceAgeHours)} saat önce`:`${Math.round(sourceAgeHours/24)} gün önce`
  const highlights=[
    {
      label:`MH${run?.gameweek||'—'} en yüksek beklenen puan`,
      title:playerLabel(best),meta:`${best?.team||'—'} • xFP • tüm senaryoların ortalamasında en yüksek beklenen puan`,
      val:Number(best?.projection?.xfp||0).toFixed(2),unit:'xFP',
      href:best?'/players/'+best.id:'/players',team:best?.team,
    },
    {
      label:`MH${run?.gameweek||'—'} en iyi F/P`,
      title:playerLabel(value),meta:`${value?.team||'—'} • Bütçe başına beklenen puan verimi`,
      val:Number(value?.projection?.value_score||0).toFixed(2),unit:'xFP/m',
      href:value?'/players/'+value.id:'/players',team:value?.team,
    },
    {
      label:`MH${run?.gameweek||'—'} takım xFP lideri`,
      title:teamXfpLeader?.name||'—',
      meta:`${teamXfpLeader?.player_count||0} aktif oyuncu • takımın bu haftaki toplam beklenen fantasy puanı`,
      val:Number(teamXfpLeader?.total_xfp||0).toFixed(2),unit:'xFP',
      href:teamHref(teamXfpLeader?.name,teamXfpLeader?.id),team:teamXfpLeader?.name,
    },
    {
      label:`MH${run?.gameweek||'—'} Top-25’e girme adayı #1`,
      title:playerLabel(top25),meta:`${top25?.team||'—'} • Yüksek puan patlaması ihtimali en güçlü aday`,
      val:`#${Number(top25?.projection?.top25_rank||1)}`,unit:'Top25 sıra',
      href:top25?'/players/'+top25.id:'/players',team:top25?.team,
    },
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
        {highlights.map(h=><Link key={h.label} className="card spotlight-card team-accent-card" style={teamCssVars(h.team)} href={h.href}>
          <span>{h.label}</span><b>{h.title}</b><small>{h.meta}</small><strong>{h.val} <em>{h.unit}</em></strong>
        </Link>)}
        <div className="card spotlight-card home-status-card home-status-week">
          <span>Güncel hafta</span>
          <b>MH{run?.gameweek||'—'}</b>
          <small>{matchCount} maç • {playerCount} oyuncu</small>
          <strong>Aktif <em>hafta</em></strong>
        </div>
        <div className="card spotlight-card home-status-card home-status-ready">
          <span>Model durumu</span>
          <b>{run?.status==='ready'?'READY':'Hazırlanıyor'}</b>
          <small>Kaynak verisi: {freshnessLabel} ({sourceUpdated})<br/>Model hesaplandı {modelUpdated}</small>
          <strong>{sourceFresh?'Veri taze':'Tazelik kontrolü gerekli'} <em>kaynak</em></strong>
        </div>
      </aside>
    </section>

    <section className="card home-model-guide">
      <div className="home-guide-copy"><span className="eyebrow">MODELİ NASIL OKUYACAKSIN?</span><h2>Tek sayıya değil, dağılıma bak.</h2><p><strong>xFP lideri</strong>, tüm senaryoların ortalamasında en yüksek puanı beklenen oyuncudur. <strong>Top‑25’e girme adayı #1</strong> ise yüksek puan patlaması ihtimali en güçlü oyuncudur. Bu yüzden aynı kişi olmak zorunda değildir.</p></div>
      <div className="home-guide-metrics">
        <div><b>xFP</b><span>Beklenen fantezi puanı</span></div>
        <div><b>xDakika</b><span>Beklenen oynama süresi</span></div>
        <div><b>P90</b><span>Üst %10 puan eşiği</span></div>
        <div><b>Top25</b><span>Haftanın üst puan dilimine girme aday sırası</span></div>
      </div>
    </section>

    <section className="home-feature-grid">
      <Link href="/players" className="card home-feature-card"><b>Oyuncu Analizleri</b><p>Tam ad, takım, rakip, rol, dakika, xFP ve gerçek haftalık performansı birlikte gör.</p><span>Oyuncu havuzu →</span></Link>
      <Link href="/teams" className="card home-feature-card"><b>Takım Profilleri</b><p>Takım renkleri, kadro, geçmiş sonuçlar, xG/xGA profili ve bu haftaki eşleşme.</p><span>Takım analizleri →</span></Link>
      <Link href="/squad" className="card home-feature-card"><b>Benim Kadrom</b><p>15 oyuncunu sahaya diz, kaptanı seç, yedeklerle dinamik swap yap ve taktiği canlı gör.</p><span>Benim Kadrom →</span></Link>
    </section>
  </>
}
