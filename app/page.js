import Link from 'next/link'
import { getMatches, getPlayersWithProjection, getRecommendation } from '@/lib/data'
import SquadPitchView from '@/components/SquadPitchView'

export const revalidate=300

const compactName=name=>{
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean)
  if(parts.length<=1)return parts[0]||'—'
  const last=parts.at(-1)
  return last.length<=3&&parts.length>2?parts.at(-2):last
}

export default async function Home(){
  const [{players,run},{matches},{recommendation,members}]=await Promise.all([
    getPlayersWithProjection(),getMatches(),getRecommendation('recommended')
  ])

  const sorted=[...players].sort((a,b)=>Number(b.projection.xfp)-Number(a.projection.xfp))
  const best=sorted[0]
  const value=[...players].sort((a,b)=>Number(b.projection.value_score)-Number(a.projection.value_score))[0]
  const mins=[...players].sort((a,b)=>Number(b.projection.x_minutes)-Number(a.projection.x_minutes))[0]
  const six=[...players].sort((a,b)=>Number(b.projection.six_plus_probability)-Number(a.projection.six_plus_probability))[0]
  const updated=run?.source_updated_at
    ? new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(run.source_updated_at))
    : '—'

  return <>
    <section className="home-gw-strip card">
      <div className="home-gw-badge"><small>AKTİF HAFTA</small><strong>GW{run?.gameweek||'—'}</strong></div>
      <div className="home-gw-status"><i/><div><b>Model hazır</b><span>Son veri {updated}</span></div></div>
      <div className="home-gw-stat"><span>Simülasyon</span><b>{Number(run?.simulation_count||0).toLocaleString('tr-TR')}</b></div>
      <div className="home-gw-stat"><span>Oyuncu</span><b>{players.length}</b></div>
      <div className="home-gw-stat"><span>Maç</span><b>{matches.length}</b></div>
      <div className="home-gw-stat accent"><span>Önerilen XI</span><b>{Number(recommendation?.xi_xfp||0).toFixed(1)} <small>xFP</small></b></div>
    </section>

    <div className="home-main-grid home-clean-grid">
      <section className="card field-panel home-squad-panel">
                <SquadPitchView
          members={members}
          title="ÖNERİLEN KADRO"
          gameweek={run?.gameweek}
          budget={recommendation?.budget}
          xiXfp={recommendation?.xi_xfp}
          actionHref="/squads"
          actionLabel="Kadro detayı →"
          compact
          showBench
        />
      </section>

      <aside className="insight-stack home-insights">
        <Link className="card spotlight-card" href={best?'/players/'+best.id:'/players'}>
          <span>Model lideri</span><b>{best?.full_name||'—'}</b><strong>{Number(best?.projection?.xfp||0).toFixed(2)} <small>xFP</small></strong><i>Oyuncuyu aç →</i>
        </Link>
        <Link className="card spotlight-card" href={value?'/players/'+value.id:'/players'}>
          <span>En iyi F/P</span><b>{value?.full_name||'—'}</b><strong>{Number(value?.projection?.value_score||0).toFixed(2)} <small>xFP/m</small></strong><i>Oyuncuyu aç →</i>
        </Link>
        <Link className="card spotlight-card" href={mins?'/players/'+mins.id:'/players'}>
          <span>En güvenli dakika</span><b>{mins?.full_name||'—'}</b><strong>{Number(mins?.projection?.x_minutes||0).toFixed(0)} <small>dk</small></strong><i>Oyuncuyu aç →</i>
        </Link>
        <Link className="card spotlight-card" href={six?'/players/'+six.id:'/players'}>
          <span>6+ puan ihtimali</span><b>{six?.full_name||'—'}</b><strong>{(Number(six?.projection?.six_plus_probability||0)*100).toFixed(0)}<small>%</small></strong><i>Oyuncuyu aç →</i>
        </Link>
      </aside>
    </div>
  </>
}
