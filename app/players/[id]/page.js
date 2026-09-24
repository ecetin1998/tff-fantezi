import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlayerDetail } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
const num=(v,d=2)=>Number(v||0).toFixed(d)
const venue=v=>v==='HOME'?'İç saha':v==='AWAY'?'Deplasman':'—'
const formatCheck=value=>{
  if(!value)return '—'
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(new Date(value)).replace(',', '')
}

export default async function PlayerPage({ params }){
  const { id }=await params
  const data=await getPlayerDetail(id)
  if(!data) notFound()

  const {run,player,projection:p,availability:a,role:r,season:s,weekly,match}=data
  const played=Number(s?.matches_played||0)
  const actual=Number(s?.actual_points||0)
  const average=played?actual/played:0
  const opponentId=match ? (Number(match.home_team_id)===Number(player.team_id)?Number(match.away_team_id):Number(match.home_team_id)) : null
  const opponent=p?.opponent_name || '—'
  const hasAvailabilityIssue=a && (['injuries','suspensions'].includes(a.availability_type) || Number(a.availability_probability??1)<.99)

  const themeStyle=teamCssVars(player.team)

  return <div className="team-player-page" style={themeStyle}>
    <Link href="/players" className="back-link">← Oyunculara dön</Link>

    <section className="card player-hero-card team-profile-hero">
      <div className="player-hero-main">
        <span className={`pos ${player.position} team-pos-badge`}>{player.position==='GK'?'KL':player.position==='MID'?'OS':player.position==='FWD'?'FOR':player.position}</span>
        <div>
          <span className="eyebrow">OYUNCU PROFİLİ</span>
          <h1>{player.full_name}</h1>
          <p><Link className="team-inline-link" href={'/teams/'+player.team_id}>{player.team}</Link> • {Number(player.price||0).toFixed(1)}m</p>
        </div>
      </div>
      <div className="player-hero-score">
        <span>MH{run?.gameweek||'—'} xFP</span>
        <strong>{num(p?.xfp)}</strong>
        <small>{p?.data_confidence||'—'} güven</small>
      </div>
    </section>

    <div className="profile-grid">
      <section className="card profile-card matchup-card">
        <span className="eyebrow">BU HAFTA</span>
        <div className="matchup-line">
          <div><small>Takım</small><Link className="team-inline-link" href={'/teams/'+player.team_id}><b>{player.team}</b></Link></div>
          <span>vs</span>
          <div><small>{venue(p?.venue)}</small>{opponentId?<Link className="team-inline-link" href={'/teams/'+opponentId}><b>{opponent}</b></Link>:<b>{opponent}</b>}</div>
        </div>
        <div className="profile-mini-grid">
          <div><span>İlk 11</span><b>{pct(p?.xi_probability)}</b></div>
          <div><span>xDakika</span><b>{num(p?.x_minutes,1)}</b></div>
          <div><span>6+ puan</span><b>{pct(p?.six_plus_probability)}</b></div>
          <div><span>F/P</span><b>{num(p?.value_score)}</b></div>
        </div>
        {hasAvailabilityIssue?<div className="availability-line">
          <b>{a?.reason||'Uygunluk sorunu'}</b>
          {a?.checked_at?<small>kontrol {formatCheck(a.checked_at)}</small>:null}
        </div>:null}
      </section>

      <section className="card profile-card">
        <span className="eyebrow">TAHMİN DAĞILIMI</span>
        <p className="projection-explainer">Temkinli: simülasyonların alt çeyreği • İyi senaryo: üst çeyreğe giriş • Tavan: üst %10'luk sonuç seviyesi.</p>
        <div className="profile-stat-grid">
          <div><span>xFP</span><b>{num(p?.xfp)}</b></div>
          <div><span>Core xFP</span><b>{num(p?.core_xfp)}</b></div>
          <div><span>xBonus</span><b>{num(p?.x_bonus)}</b></div>
          <div><span>Temkinli</span><b>{num(p?.p25,1)}</b></div>
          <div><span>İyi senaryo</span><b>{num(p?.p75,1)}</b></div>
          <div><span>Tavan</span><b>{num(p?.p90,1)}</b></div>
          <div><span>Beklenen gol</span><b>{num(p?.expected_goals)}</b></div>
          <div><span>Beklenen asist</span><b>{num(p?.expected_assists)}</b></div>
        </div>
      </section>
    </div>

    <section className="card profile-card season-card">
      <div className="panel-head">
        <div><span className="eyebrow">SEZON GERÇEKLERİ</span><h2>MH1–MH{s?.through_gameweek||'—'}</h2></div>
        <span className="pill team-pill">{actual} fantasy puanı</span>
      </div>
      <div className="season-stat-grid">
        <div><span>Maç</span><b>{played}</b></div>
        <div><span>İlk 11</span><b>{Number(s?.starts||0)}</b></div>
        <div><span>Dakika</span><b>{num(s?.minutes,0)}</b></div>
        <div><span>Puan / maç</span><b>{average.toFixed(2)}</b></div>
        <div><span>Gol</span><b>{Number(s?.goals||0)}</b></div>
        <div><span>Asist</span><b>{Number(s?.assists||0)}</b></div>
        <div><span>xG toplam</span><b>{num(s?.xg_total)}</b></div>
        <div><span>6+ maç</span><b>{Number(s?.six_plus_count||0)}</b></div>
        <div><span>Clean sheet</span><b>{Number(s?.clean_sheets||0)}</b></div>
        <div><span>Kurtarış</span><b>{Number(s?.saves||0)}</b></div>
        <div><span>Sarı</span><b>{Number(s?.yellow_cards||0)}</b></div>
        <div><span>Kırmızı</span><b>{Number(s?.red_cards||0)}</b></div>
      </div>
    </section>

    <div className="profile-grid">
      <section className="card profile-card">
        <span className="eyebrow">ROL & DAKİKA</span>
        <h2>{r?.signal||'—'}</h2>
        <div className="detail-list">
          <div><span>Son 2 maç XI</span><b>{pct(r?.last2_xi_probability)}</b></div>
          <div><span>Önceki 2 maç XI</span><b>{pct(r?.previous2_xi_probability)}</b></div>
          <div><span>Son 2 dakika</span><b>{num(r?.last2_minutes,1)}</b></div>
          <div><span>Önceki 2 dakika</span><b>{num(r?.previous2_minutes,1)}</b></div>
          <div><span>Takım gol payı</span><b>{pct(r?.team_goal_share)}</b></div>
          <div><span>Takım asist payı</span><b>{pct(r?.team_assist_share)}</b></div>
        </div>
      </section>

      <section className="card profile-card">
        <span className="eyebrow">MODEL NOTU</span>
        <h2>{p?.data_confidence||'—'} güven</h2>
        {p?.role_note?<p className="profile-note">{p.role_note}</p>:null}
        <div className="detail-list">
          <div><span>Oynama olasılığı</span><b>{pct(p?.appearance_probability)}</b></div>
          <div><span>60+ dakika</span><b>{pct(p?.over60_probability)}</b></div>
          <div><span>MC standart hata</span><b>{num(p?.mc_standard_error,3)}</b></div>
        </div>
      </section>
    </div>

    <section className="card profile-card weekly-history-card">
      <div className="panel-head">
        <div><span className="eyebrow">HAFTA HAFTA</span><h2>Gerçek Fantasy Puanları</h2></div>
        <Link className="pill" href="/points">Tüm oyuncular →</Link>
      </div>
      {weekly?.length?
        <div className="weekly-history-grid">{weekly.map(h=>
          <div className="week-score" key={h.id}>
            <span>MH{h.gameweek}</span>
            <strong>{h.points}</strong>
            <small>{h.minutes!==null&&h.minutes!==undefined?`${Number(h.minutes).toFixed(0)} dk`:'final puan'}</small>
          </div>
        )}</div>
        :<p className="muted">Henüz kapanmış hafta verisi yok.</p>}
    </section>
  </div>
}
