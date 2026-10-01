import Link from 'next/link'
import { getAuthState, getHomeOverview } from '@/lib/data'
import { teamCssVars, teamHref } from '@/lib/teamThemes'
import {playerLabel} from '@/lib/playerPresentation'

export const revalidate=300

export default async function Home(){
  const [overview,auth]=await Promise.all([getHomeOverview(),getAuthState()])
  const {run,best,value,teamXfpLeader,top25,playerCount,matchCount}=overview
  const isPro=auth.plan==='pro'
  const latestDataAt=run?.decision_data_at||run?.source_updated_at||null
  const sourceUpdated=latestDataAt?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(latestDataAt)):'—'
  const modelUpdated=run?.generated_at?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(run.generated_at)):'—'
  const sourceAgeHours=Number.isFinite(Number(run?.decision_data_age_hours))?Number(run.decision_data_age_hours):Infinity
  const sourceFresh=sourceAgeHours<=24
  const freshnessLabel=!Number.isFinite(sourceAgeHours)?'Bilinmiyor':sourceAgeHours<1?'1 saatten yeni':sourceAgeHours<24?`${Math.round(sourceAgeHours)} saat önce`:`${Math.round(sourceAgeHours/24)} gün önce`
  const simulationLabel=Number(run?.simulation_count||0)>=1000?`${Math.round(Number(run.simulation_count)/1000)}K`:String(run?.simulation_count||'—')
  const highlights=[
    {
      label:`MH${run?.gameweek||'—'} xFP lideri`,
      title:playerLabel(best),meta:`${best?.team||'—'} • en yüksek ortalama beklenti`,
      val:Number(best?.projection?.xfp||0).toFixed(2),unit:'xFP',
      href:best?'/players/'+best.id:'/players',team:best?.team,
    },
    {
      label:`MH${run?.gameweek||'—'} fiyat / performans`,
      title:playerLabel(value),meta:`${value?.team||'—'} • bütçe başına en güçlü verim`,
      val:Number(value?.projection?.value_score||0).toFixed(2),unit:'xFP/m',
      href:value?'/players/'+value.id:'/players',team:value?.team,
    },
    {
      label:`MH${run?.gameweek||'—'} takım xFP lideri`,
      title:teamXfpLeader?.name||'—',
      meta:`${teamXfpLeader?.player_count||0} aktif oyuncu • toplam havuz beklentisi`,
      val:Number(teamXfpLeader?.total_xfp||0).toFixed(2),unit:'xFP',
      href:teamHref(teamXfpLeader?.name,teamXfpLeader?.id),team:teamXfpLeader?.name,
    },
    isPro?{
      label:`MH${run?.gameweek||'—'} Top-25 adayı #1`,
      title:playerLabel(top25),meta:`${top25?.team||'—'} • üst dilime çıkma profili`,
      val:`#${Number(top25?.projection?.top25_rank||1)}`,unit:'Top25',
      href:top25?'/players/'+top25.id:'/players',team:top25?.team,
    }:{
      label:'PRO • Tavan analizi',
      title:'Top-25 ve P90',
      meta:'yüksek skor adayları • gelişmiş dağılım',
      val:'PRO',unit:'analiz',
      href:'/pricing',team:null,
    },
  ]

  return <div className="home-shell">
    <section className="home-intro-layout">
      <div className="card home-intro-hero">
        <div className="home-hero-kicker">
          <span className="eyebrow">SÜPER LİG FANTASY ANALİZ PLATFORMU</span>
          <span className="home-live-pill">MH{run?.gameweek||'—'} • {simulationLabel} sim</span>
        </div>
        <h1>Veriyi oku.<br/><span>Kararı sen ver.</span></h1>
        <p>Oyuncu rolü, dakika ihtimali, maç modeli ve puan dağılımını tek bir karar ekranında birleştiriyoruz. Tek bir “doğru kadro” yerine, nedenini görebildiğin daha güçlü seçimler yap.</p>
        <div className="home-intro-actions">
          <Link href="/players" className="cta">Oyuncuları incele</Link>
          <Link href="/squad" className="secondary">Kadromu kur</Link>
          <Link href="/matches" className="text-action">Maç modeline git <span>→</span></Link>
        </div>
        <div className="home-hero-mini">
          <div><b>{playerCount}</b><span>aktif oyuncu</span></div>
          <div><b>{matchCount}</b><span>haftalık maç</span></div>
          <div><b>{simulationLabel}</b><span>simülasyon</span></div>
        </div>
      </div>

      <aside className="home-highlight-grid">
        {highlights.map(h=><Link key={h.label} className="card spotlight-card home-highlight-card team-accent-card" style={teamCssVars(h.team)} href={h.href}>
          <span>{h.label}</span>
          <b>{h.title}</b>
          <small>{h.meta}</small>
          <strong>{h.val} <em>{h.unit}</em></strong>
        </Link>)}
        <div className="card spotlight-card home-status-card home-status-week">
          <span>Yayınlanan hafta</span>
          <b>MH{run?.gameweek||'—'}</b>
          <small>{matchCount} maç • {playerCount} oyuncu • {simulationLabel} sim</small>
          <strong>Canlı <em>model</em></strong>
        </div>
        <div className={`card spotlight-card home-status-card home-status-ready ${sourceFresh?'fresh':'stale'}`}>
          <span>Model & veri durumu</span>
          <b>{run?.status==='ready'?'READY':'Hazırlanıyor'}</b>
          <small>Sakatlık/ceza: {freshnessLabel}<br/>Kaynak {sourceUpdated} • model {modelUpdated}</small>
          <strong>{sourceFresh?'Veri taze':'Tazelik kontrolü'} <em>availability</em></strong>
        </div>
      </aside>
    </section>

    <section className="card home-model-guide">
      <div className="home-guide-copy">
        <span className="eyebrow">MODELİ NASIL OKUYACAKSIN?</span>
        <h2>Tek sayıya değil,<br/><span>dağılıma bak.</span></h2>
        <p><strong>xFP</strong> ortalama beklentiyi gösterir. <strong>P90</strong> ve <strong>Top‑25</strong> yüksek tavanı ve haftanın üst puan dilimine girme profilini anlatan Pro katmanlarıdır.</p>
        <Link href="/sss" className="home-guide-link">Metodolojiyi aç <span>→</span></Link>
      </div>
      <div className="home-guide-metrics">
        <div><b>xFP</b><span>Beklenen fantasy puanı</span><small>Ortalama senaryo</small></div>
        <div><b>xDakika</b><span>Beklenen oynama süresi</span><small>Rol + ilk 11 ihtimali</small></div>
        <div><b>P90</b><span>Üst %10 puan eşiği</span><small>Tavan senaryosu</small></div>
        <div><b>Top‑25</b><span>Üst dilime girme profili</span><small>Patlama ihtimali</small></div>
      </div>
    </section>

    <section className="home-feature-section">
      <div className="home-section-head">
        <div><span className="eyebrow">SCOUT MERKEZİ</span><h2>Karar akışın tek yerde.</h2></div>
        <p>Oyuncudan maça, maçtan kadroya aynı veri zincirini takip et.</p>
      </div>
      <div className="home-feature-grid">
        <Link href="/players" className="card home-feature-card">
          <span className="home-feature-no">01</span>
          <div><b>Oyuncu Analizleri</b><p>Tam ad, takım, rakip, rol, dakika, xFP, P90 ve gerçek haftalık performansı birlikte gör.</p></div>
          <strong>Oyuncu havuzu <i>→</i></strong>
        </Link>
        <Link href="/teams" className="card home-feature-card">
          <span className="home-feature-no">02</span>
          <div><b>Takım Profilleri</b><p>Takım formu, xG/xGA, hücum kanalları, fikstür ve matchup etkisini aynı profilde incele.</p></div>
          <strong>Takım analizleri <i>→</i></strong>
        </Link>
        <Link href="/squad" className="card home-feature-card">
          <span className="home-feature-no">03</span>
          <div><b>Benim Kadrom</b><p>15 oyuncunu kur, sahayı otomatik diz, kaptanı seç ve model kadronla farkları anında gör.</p></div>
          <strong>Kadromu aç <i>→</i></strong>
        </Link>
      </div>
    </section>
  </div>
}
