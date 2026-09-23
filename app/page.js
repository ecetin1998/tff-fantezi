import Link from 'next/link'
import { getMatches, getPlayersWithProjection, getRecommendation, getModelOverview } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

export default async function Home(){
  const [{players,run},{matches},{recommendation,members},overview]=await Promise.all([
    getPlayersWithProjection(),getMatches(),getRecommendation('recommended'),getModelOverview()
  ])

  const sorted=[...players].sort((a,b)=>Number(b.projection.xfp)-Number(a.projection.xfp))
  const best=sorted[0]
  const value=[...players].sort((a,b)=>Number(b.projection.value_score)-Number(a.projection.value_score))[0]
  const mins=[...players].sort((a,b)=>Number(b.projection.x_minutes)-Number(a.projection.x_minutes))[0]
  const six=[...players].sort((a,b)=>Number(b.projection.six_plus_probability)-Number(a.projection.six_plus_probability))[0]
  const xi=members.filter(m=>m.squad_slot==='XI')
  const groups=['GK','DEF','MID','FWD']
  const formation=`${xi.filter(m=>m.player?.position==='DEF').length}-${xi.filter(m=>m.player?.position==='MID').length}-${xi.filter(m=>m.player?.position==='FWD').length}`

  const sections=[
    ['/players','Oyuncu Analizi','xFP • dakika • rol • fiyat'],
    ['/points','Haftalık Puanlar','Gerçek puanlar • ortalama • 6+'],
    ['/teams','Takım & Fikstür','Takım xG • CS • rakip'],
    ['/availability','Sakatlık & Ceza','Güncel availability takibi'],
    ['/roles','Rol Takibi','Dakika ve ilk 11 değişimleri'],
    ['/model','Model & Güven','Veri tazeliği ve model sağlığı'],
  ]

  return <>
    <section className="gameweek-banner">
      <div className="gw-orb"><small>AKTİF</small><strong>GW{run?.gameweek||'—'}</strong></div>
      <div className="gameweek-copy">
        <span className="eyebrow">{Number(run?.simulation_count||0).toLocaleString('tr-TR')} SİMÜLASYON</span>
        <h1>Bu haftanın <span>karar merkezi.</span></h1>
        <p>Oyuncu seçimi, maç tahmini, rol ve kadro kararlarını tek ekranda topla.</p>
        <div className="hero-actions">
          <Link href="/players" className="cta">Oyuncuları keşfet</Link>
          <Link href="/squad" className="secondary">Kadromu analiz et</Link>
        </div>
      </div>
      <div className="hero-score">
        <span>Önerilen XI</span>
        <strong>{Number(recommendation?.xi_xfp||0).toFixed(1)}</strong>
        <small>xFP • {formation}</small>
      </div>
    </section>

    <section className="model-live-strip">
      <div><i/><b>Model hazır</b></div>
      <span>Son veri <strong>{run?.source_updated_at?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(run.source_updated_at)):'—'}</strong></span>
      <span><strong>{players.length}</strong> oyuncu</span>
      <span><strong>{matches.length}</strong> maç</span>
      <Link href="/model">Güven & güncellik →</Link>
    </section>

    <section className="quick-actions" aria-label="Hızlı erişim">
      <Link href="/players"><span>◉</span><div><b>Oyuncu bul</b><small>529 kişilik havuz</small></div><i>›</i></Link>
      <Link href="/matches"><span>◎</span><div><b>Maçları incele</b><small>{matches.length} tahmin</small></div><i>›</i></Link>
      <Link href="/squads"><span>▦</span><div><b>Önerilen kadro</b><small>XI + bench</small></div><i>›</i></Link>
      <Link href="/points"><span>↗</span><div><b>Haftalık puanlar</b><small>Gerçek performans</small></div><i>›</i></Link>
    </section>

    <div className="home-main-grid">
      <section className="card field-panel">
        <div className="panel-head">
          <div><span className="eyebrow">ÖNERİLEN KADRO</span><h2>GW{run?.gameweek||'—'} • {formation}</h2></div>
          <Link href="/squads" className="pill">Tüm kadro →</Link>
        </div>
        <div className="fantasy-pitch compact-pitch">
          <div className="pitch-center-circle"/>
          {groups.map(pos=><div className={`pitch-row pitch-${pos}`} key={pos}>
            {xi.filter(m=>m.player?.position===pos).map(m=>
              <Link href={'/players/'+m.player_id} className="pitch-player club-pitch-player" style={teamCssVars(m.team)} key={m.player_id}>
                <span className={`shirt-dot ${pos}`} style={teamCssVars(m.team)}>{pos}</span>
                <b>{m.player?.full_name}</b>
                <small>{Number(m.xfp||0).toFixed(1)} xFP</small>
                {m.is_captain?<em>C</em>:null}
              </Link>
            )}
          </div>)}
        </div>
      </section>

      <aside className="insight-stack">
        <div className="card spotlight-card"><span>Model lideri</span><Link href={best?'/players/'+best.id:'/players'}><b>{best?.full_name||'—'}</b></Link><strong>{Number(best?.projection?.xfp||0).toFixed(2)} <small>xFP</small></strong></div>
        <div className="card spotlight-card"><span>En iyi F/P</span><Link href={value?'/players/'+value.id:'/players'}><b>{value?.full_name||'—'}</b></Link><strong>{Number(value?.projection?.value_score||0).toFixed(2)} <small>xFP/m</small></strong></div>
        <div className="card spotlight-card"><span>En güvenli dakika</span><Link href={mins?'/players/'+mins.id:'/players'}><b>{mins?.full_name||'—'}</b></Link><strong>{Number(mins?.projection?.x_minutes||0).toFixed(0)} <small>dk</small></strong></div>
        <div className="card spotlight-card"><span>6+ puan ihtimali</span><Link href={six?'/players/'+six.id:'/players'}><b>{six?.full_name||'—'}</b></Link><strong>{(Number(six?.projection?.six_plus_probability||0)*100).toFixed(0)}<small>%</small></strong></div>
      </aside>
    </div>

    <section className="analysis-hub">
      <div className="section-title compact">
        <div><span className="eyebrow">DAHA FAZLA ANALİZ</span><h2>İhtiyacın olan ekrana direkt git</h2></div>
      </div>
      <div className="hub-grid">{sections.map(([href,title,desc])=>
        <Link href={href} className="card hub-card" key={href}><b>{title}</b><span>{desc}</span><i>→</i></Link>
      )}</div>
    </section>

    <section className="card model-strip">
      <div><span className="eyebrow">MODEL DURUMU</span><b>{run?.model_version||'—'}</b></div>
      <div><span>Projeksiyon</span><strong>{overview.counts.projectionCount||0}</strong></div>
      <div><span>Rol sinyali</span><strong>{overview.counts.roleCount||0}</strong></div>
      <div><span>Availability</span><strong>{overview.counts.availabilityCount||0}</strong></div>
      <div><span>Maç</span><strong>{overview.counts.matchCount||0}</strong></div>
      <Link href="/model">Detay →</Link>
    </section>
  </>
}
