import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlayerDetail } from '@/lib/data'

export const revalidate=300

const pct=v=>(Number(v||0)*100).toFixed(0)+'%'
const num=(v,d=2)=>Number(v||0).toFixed(d)
const venue=v=>v==='HOME'?'İç saha':v==='AWAY'?'Deplasman':v||'—'
const availabilityLabel={injuries:'Sakatlık',suspensions:'Ceza',return:'Dönüş',baseline:'Kontrol'}

function formatDate(value){
  if(!value)return '—'
  const parts=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value))
  const get=t=>parts.find(x=>x.type===t)?.value||''
  return get('day')+'/'+get('month')+'/'+get('year')+' '+get('hour')+':'+get('minute')
}

export default async function PlayerDetail({params}){
  const {id}=await params
  const data=await getPlayerDetail(id)
  if(!data)notFound()

  const {run,player,projection,availability,role,season,weekly,match}=data
  const played=Number(season?.matches_played||0)
  const actual=Number(season?.actual_points||0)
  const avg=played?actual/played:0
  const six=played?Number(season?.six_plus_count||0)/played:0

  return <>
    <div className="player-profile-head">
      <div>
        <Link href="/players" className="back-link">← Oyuncular</Link>
        <div className="player-title-row">
          <span className={['pos',player.position].join(' ')}>{player.position}</span>
          <span className="eyebrow">OYUNCU PROFİLİ</span>
        </div>
        <h1>{player.full_name}</h1>
        <p>{player.team} • {Number(player.price||0).toFixed(1)}m</p>
      </div>
      <div className="fixture-card card">
        <span>GW{run?.gameweek||'—'} rakibi</span>
        <strong>{projection?.opponent_name||'—'}</strong>
        <small>{venue(projection?.venue)}{match?.kickoff_at?' • '+formatDate(match.kickoff_at):''}</small>
      </div>
    </div>

    <div className="grid stats profile-stats">
      <div className="card stat"><span>xFP</span><strong>{num(projection?.xfp)}</strong><em>Core {num(projection?.core_xfp)} + {num(projection?.x_bonus)} bonus</em></div>
      <div className="card stat"><span>İlk 11 olasılığı</span><strong>{pct(projection?.xi_probability)}</strong><em>{num(projection?.x_minutes,1)} xDakika</em></div>
      <div className="card stat"><span>Ceiling</span><strong>{num(projection?.p90,1)}</strong><em>P25 {num(projection?.p25,1)} • P75 {num(projection?.p75,1)}</em></div>
      <div className="card stat"><span>6+ puan</span><strong>{pct(projection?.six_plus_probability)}</strong><em>{projection?.data_confidence||'—'} güven</em></div>
    </div>

    <div className="split profile-split">
      <section className="card panel">
        <div className="panel-head"><div><span className="eyebrow">BU HAFTA</span><h2>Model görünümü</h2></div><span className="pill">GW{run?.gameweek||'—'}</span></div>
        <div className="detail-list">
          <div><span>Rakip</span><b>{projection?.opponent_name||'—'} • {venue(projection?.venue)}</b></div>
          <div><span>Beklenen gol</span><b>{num(projection?.expected_goals)}</b></div>
          <div><span>Beklenen asist</span><b>{num(projection?.expected_assists)}</b></div>
          <div><span>Oynama olasılığı</span><b>{pct(projection?.appearance_probability)}</b></div>
          <div><span>60+ dakika</span><b>{pct(projection?.over60_probability)}</b></div>
          <div><span>Fiyat / performans</span><b>{num(projection?.value_score)}</b></div>
          <div><span>Rol sinyali</span><b>{role?.signal||'Belirgin değişim yok'}</b></div>
          <div><span>Veri güveni</span><b>{projection?.data_confidence||'—'}</b></div>
        </div>
      </section>

      <section className="card panel">
        <div className="panel-head"><div><span className="eyebrow">SEZON</span><h2>Gerçek istatistikler</h2></div><span className="pill">GW1–GW{season?.through_gameweek||'—'}</span></div>
        <div className="detail-list">
          <div><span>Fantasy puanı</span><b>{actual}</b></div>
          <div><span>Maç / İlk 11</span><b>{played} / {Number(season?.starts||0)}</b></div>
          <div><span>Dakika</span><b>{num(season?.minutes,0)}</b></div>
          <div><span>Gol / Asist</span><b>{Number(season?.goals||0)} / {Number(season?.assists||0)}</b></div>
          <div><span>Clean sheet</span><b>{Number(season?.clean_sheets||0)}</b></div>
          <div><span>Kurtarış</span><b>{Number(season?.saves||0)}</b></div>
          <div><span>xG toplam</span><b>{num(season?.xg_total)}</b></div>
          <div><span>Puan ortalaması</span><b>{num(avg)} • 6+ {pct(six)}</b></div>
        </div>
      </section>
    </div>

    <section className="card panel profile-status">
      <div className="panel-head"><div><span className="eyebrow">DURUM & ROL</span><h2>Güncel oyuncu notu</h2></div>{availability?<span className="status-chip">{availabilityLabel[availability.availability_type]||availability.availability_type}</span>:<span className="status-chip">Aktif havuz</span>}</div>
      {availability?.reason?<p className="profile-note"><b>{availability.reason}</b>{availability.checked_at?' • kontrol '+formatDate(availability.checked_at):''}</p>:<p className="profile-note">Aktif havuz</p>}
      <div className="profile-role-grid">
        <div><span>Son 2 XI</span><b>{pct(role?.last2_xi_probability)}</b></div>
        <div><span>Önceki 2 XI</span><b>{pct(role?.previous2_xi_probability)}</b></div>
        <div><span>Son 2 dk</span><b>{num(role?.last2_minutes,1)}</b></div>
        <div><span>Tahmin xDk</span><b>{num(role?.x_minutes??projection?.x_minutes,1)}</b></div>
      </div>
    </section>

    <section className="profile-history">
      <div className="section-title compact"><div><span className="eyebrow">HAFTA HAFTA</span><h2>Gerçek fantasy puanları</h2></div><Link href="/points" className="pill">Tüm oyuncular →</Link></div>
      <div className="weekly-history-grid">
        {weekly.length?weekly.map(w=><div className="card weekly-history-card" key={w.gameweek}>
          <span>GW{w.gameweek}</span>
          <strong>{w.points}</strong>
          <small>{w.minutes!==null&&w.minutes!==undefined?num(w.minutes,0)+' dk':'Final puan'}</small>
        </div>):<div className="card panel muted">Henüz final haftalık puan kaydı yok.</div>}
      </div>
    </section>
  </>
}
