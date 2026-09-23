import Link from 'next/link'
import { getMatches, getPlayersWithProjection, getRecommendation, getModelOverview } from '@/lib/data'
export const revalidate=300
export default async function Home(){
  const [{players,run},{matches},{recommendation,members},overview]=await Promise.all([getPlayersWithProjection(),getMatches(),getRecommendation('recommended'),getModelOverview()])
  const sorted=[...players].sort((a,b)=>Number(b.projection.xfp)-Number(a.projection.xfp)),best=sorted[0]
  const value=[...players].sort((a,b)=>Number(b.projection.value_score)-Number(a.projection.value_score))[0]
  const mins=[...players].sort((a,b)=>Number(b.projection.x_minutes)-Number(a.projection.x_minutes))[0]
  const six=[...players].sort((a,b)=>Number(b.projection.six_plus_probability)-Number(a.projection.six_plus_probability))[0]
  const xi=members.filter(m=>m.squad_slot==='XI')
  const sections=[
    ['/players','Oyuncu Analizi',`${players.length} oyuncu • xFP, P25/P75/P90, xG/xA, XI%, dakika`],
    ['/points','Haftalık Fantasy Puanları','GW bazında gerçek fantasy puanları, toplam, ortalama ve 6+ oranı'],
    ['/teams','Takım & Fikstür',`${matches.length*2} takım görünümü • xG, CS ve galibiyet olasılığı`],
    ['/matches','Maç Tahminleri',`${matches.length} maç • skor senaryoları, KG Var, 2.5 Üst`],
    ['/squads','Önerilen / Alternatif','İlk 11, bench, kaptan, bütçe ve ceiling alternatifi'],
    ['/availability','Sakatlık & Ceza',`${overview.counts.availabilityCount||0} güncel availability kaydı`],
    ['/roles','Rol Takibi',`${overview.counts.roleCount||0} oyuncu • rol yükseliyor/düşüyor, xDakika`],
    ['/model','Model & Güven','Model sürümü, kaynak güncelliği ve veri güveni'],
    ['/squad','Benim Kadrom','15 kişilik kadronu kaydet ve transfer önerisi al'],
  ]
  return <>
    <section className="hero"><div><div className="eyebrow">GW{run?.gameweek||'—'} • {Number(run?.simulation_count||0).toLocaleString('tr-TR')} simülasyon</div><h1>Fantasy kararlarını<br/><span>veriyle yönet.</span></h1><p>xFP, rol, dakika, fikstür, sakatlık ve maç olasılıklarını tek analiz merkezinde birleştir.</p><div className="hero-actions"><Link href="/players" className="cta">Oyuncuları incele</Link><Link href="/squad" className="secondary">Takımımı analiz et</Link></div></div><div className="hero-score"><span>Önerilen XI</span><strong>{Number(recommendation?.xi_xfp||0).toFixed(2)}</strong><small>toplam xFP</small></div></section>
    <section className="analysis-hub"><div className="section-title compact"><div><span className="eyebrow">ANALİZ MERKEZİ</span><h2>Sheet’teki ana ekranlar, tek menüde</h2></div></div><div className="hub-grid">{sections.map(([href,title,desc])=><Link href={href} className="card hub-card" key={href}><b>{title}</b><span>{desc}</span><i>→</i></Link>)}</div></section>
    <div className="grid stats"><div className="card stat"><span>Model lideri</span><strong>{best?<Link className="player-link" href={'/players/'+best.id}>{best.full_name}</Link>:'—'}</strong><em>{Number(best?.projection?.xfp||0).toFixed(2)} xFP</em></div><div className="card stat"><span>En iyi F/P</span><strong>{value?<Link className="player-link" href={'/players/'+value.id}>{value.full_name}</Link>:'—'}</strong><em>{Number(value?.projection?.value_score||0).toFixed(2)} xFP/m</em></div><div className="card stat"><span>En güvenli dakika</span><strong>{mins?<Link className="player-link" href={'/players/'+mins.id}>{mins.full_name}</Link>:'—'}</strong><em>{Number(mins?.projection?.x_minutes||0).toFixed(1)} xDakika</em></div><div className="card stat"><span>6+ puan</span><strong>{six?<Link className="player-link" href={'/players/'+six.id}>{six.full_name}</Link>:'—'}</strong><em>{(Number(six?.projection?.six_plus_probability||0)*100).toFixed(1)}%</em></div></div>
    <div className="split"><section className="card panel"><div className="panel-head"><div><span className="eyebrow">ÖNERİLEN KADRO</span><h2>GW{run?.gameweek||'—'} İlk 11</h2></div><Link href="/squads" className="pill">Tam kadro →</Link></div><div className="squad-list">{xi.map(m=><div key={m.player_id} className="squad-row"><span className={`pos ${m.player?.position}`}>{m.player?.position}</span><div><Link className="player-link" href={'/players/'+m.player_id}><b>{m.player?.full_name}</b></Link><small>{m.team} • {Number(m.player?.price||0).toFixed(1)}m</small></div><strong>{Number(m.xfp||0).toFixed(2)}</strong>{m.is_captain?<span className="captain">C</span>:null}</div>)}</div></section>
    <section className="card panel"><div className="panel-head"><div><span className="eyebrow">MODEL SAĞLIĞI</span><h2>{run?.model_version||'—'}</h2></div><span className="pill good">{run?.status||'—'}</span></div><div className="detail-list"><div><span>Oyuncu projeksiyonu</span><b>{overview.counts.projectionCount||0}</b></div><div><span>Rol sinyali</span><b>{overview.counts.roleCount||0}</b></div><div><span>Sakatlık/Ceza</span><b>{overview.counts.availabilityCount||0}</b></div><div><span>Maç modeli</span><b>{overview.counts.matchCount||0}</b></div></div><Link href="/model" className="secondary wide-link">Güven & güncellik detayları</Link></section></div>
  </>
}