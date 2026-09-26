import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlayerDetail } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'
import { availabilityCompactNote, availabilityIsIssue } from '@/lib/availability'

export const revalidate=300
export async function generateMetadata({params}){
  const {id}=await params
  const data=await getPlayerDetail(id)
  if(!data)return {title:'Oyuncu bulunamadı'}
  return {title:data.player.full_name+' • Oyuncu Analizi',description:data.player.full_name+' için xFP, dakika, rol ve haftalık fantasy performansı.'}
}

const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
const num=(v,d=2)=>Number(v||0).toFixed(d)
const venue=v=>v==='HOME'?'Ev':v==='AWAY'?'Dep':'—'
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const formatCheck=value=>{
  if(!value)return '—'
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  }).format(new Date(value)).replace(',', '')
}

function MetricGrid({items,className=''}){
  return <div className={`player-detail-metric-grid ${className}`}>
    {items.map(item=><div className={item.emphasis?'is-emphasis':''} key={item.label}>
      <span>{item.label}</span>
      <b>{item.value}</b>
      {item.note?<small>{item.note}</small>:null}
    </div>)}
  </div>
}

export default async function PlayerPage({ params }){
  const { id }=await params
  const data=await getPlayerDetail(id)
  if(!data) notFound()

  const {run,player,projection:p,availability:a,role:r,season:s,weekly,match}=data
  const closedWeeks=[...(weekly||[])].sort((x,y)=>Number(x.gameweek||0)-Number(y.gameweek||0))
  const playedWeeks=closedWeeks.filter(w=>Number(w.minutes||0)>0)
  const played=playedWeeks.length
  const actual=closedWeeks.reduce((sum,w)=>sum+Number(w.points||0),0)
  const average=played?actual/played:0
  const opponentId=match ? (Number(match.home_team_id)===Number(player.team_id)?Number(match.away_team_id):Number(match.home_team_id)) : null
  const opponent=p?.opponent_name || '—'
  const hasAvailabilityIssue=availabilityIsIssue(a)
  const hasAvailabilityInfo=a && (hasAvailabilityIssue || a.availability_type==='return' || a.expected_return || a.suspension_fixture || a.source_reason)
  const availabilityNote=availabilityCompactNote(a)
  const isGK=player.position==='GK'
  const isDEF=player.position==='DEF'
  const themeStyle=teamCssVars(player.team)

  const recentWeeks=playedWeeks.slice(-3)
  const recentAverage=recentWeeks.length?recentWeeks.reduce((sum,w)=>sum+Number(w.points||0),0)/recentWeeks.length:0
  const lastWeek=closedWeeks.at(-1)
  const bestWeek=closedWeeks.length?Math.max(...closedWeeks.map(w=>Number(w.points||0))):0

  const decisionMetrics=[
    {label:'xFP',value:num(p?.xfp),note:`MH${run?.gameweek||'—'} beklenen`,emphasis:true},
    {label:'İlk 11',value:pct(p?.xi_probability),note:'başlama ihtimali'},
    {label:'xDakika',value:num(p?.x_minutes,0),note:'beklenen süre'},
    {label:'6+ puan',value:pct(p?.six_plus_probability),note:'yüksek getiri ihtimali'},
    {label:'P90',value:num(p?.p90,1),note:'üst %10 eşiği'},
    {label:'F/P',value:num(p?.value_score),note:'fiyat verimliliği'},
  ]

  const scenarioMetrics=[
    {label:'Temkinli',value:num(p?.p25,1),note:'alt çeyrek'},
    {label:'Beklenti',value:num(p?.xfp,1),note:'ortalama senaryo',emphasis:true},
    {label:'İyi senaryo',value:num(p?.p75,1),note:'üst çeyreğe giriş'},
    {label:'Tavan',value:num(p?.p90,1),note:'üst %10'},
  ]

  const seasonMetrics=[
    {label:'Toplam puan',value:num(actual,0),emphasis:true},
    {label:'Puan / maç',value:average.toFixed(2)},
    {label:'Maç',value:played},
    {label:'İlk 11',value:Number(s?.starts||0)},
    {label:'Dakika',value:num(s?.minutes,0)},
    {label:'6+ maç',value:Number(s?.six_plus_count||0)},
  ]
  if(isGK){
    seasonMetrics.push(
      {label:'Gol yemeden',value:Number(s?.clean_sheets||0)},
      {label:'Kurtarış',value:Number(s?.saves||0)}
    )
  }else{
    seasonMetrics.push(
      {label:'Gol',value:Number(s?.goals||0)},
      {label:'Asist',value:Number(s?.assists||0)},
      {label:'xG toplam',value:num(s?.xg_total)}
    )
    if(isDEF)seasonMetrics.push({label:'Gol yemeden',value:Number(s?.clean_sheets||0)})
  }
  seasonMetrics.push(
    {label:'Sarı kart',value:Number(s?.yellow_cards||0)},
    {label:'Kırmızı kart',value:Number(s?.red_cards||0)}
  )

  const roleMetrics=[
    {label:'Son 2 maç XI',value:pct(r?.last2_xi_probability)},
    {label:'Önceki 2 maç XI',value:pct(r?.previous2_xi_probability)},
    {label:'Son 2 dakika',value:num(r?.last2_minutes,1)},
    {label:'Önceki 2 dakika',value:num(r?.previous2_minutes,1)},
  ]

  return <div className="team-player-page player-detail-v2" style={themeStyle}>
    <Link href="/players" className="back-link">← Oyuncu Analizi'ne dön</Link>

    <section className="card player-hero-card team-profile-hero player-detail-hero">
      <div className="player-hero-main">
        <span className={`pos ${player.position} team-pos-badge`}>{posLabel(player.position)}</span>
        <div className="player-detail-identity">
          <span className="eyebrow">OYUNCU ANALİZİ</span>
          <h1>{player.full_name}</h1>
          <p>
            <Link className="team-inline-link" href={'/teams/'+player.team_id}>{player.team}</Link>
            <span>•</span><b>{Number(player.price||0).toFixed(1)}m</b>
          </p>
          <div className="player-identity-pills">
            <span>{actual} toplam puan</span>
            <span>{average.toFixed(2)} puan/maç</span>
            {lastWeek?<span>Son MH: {Number(lastWeek.points||0)} puan</span>:null}
          </div>
        </div>
      </div>
      <div className="player-hero-score">
        <span>MH{run?.gameweek||'—'} xFP</span>
        <strong>{num(p?.xfp)}</strong>
        <small>{pct(p?.xi_probability)} ilk 11 • {num(p?.x_minutes,0)} dk</small>
      </div>
    </section>

    {hasAvailabilityInfo?<div className={`availability-line player-detail-alert ${a?.availability_type==='return'?'is-return':''}`}>
      <div className="player-availability-copy">
        <span>{a?.availability_type==='return'?'DÖNÜŞ NOTU':'UYGUNLUK UYARISI'}</span>
        <b>{availabilityNote||'Oynama durumu takip ediliyor'}</b>
        <div className="player-availability-meta">
          {a?.injury_date?<small>Başlangıç: {new Intl.DateTimeFormat('tr-TR').format(new Date(a.injury_date+'T12:00:00Z'))}</small>:null}
          {a?.suspension_fixture?<small>Ceza maçı: {a.suspension_fixture}</small>:null}
        </div>
      </div>
      {a?.checked_at?<small className="player-availability-check">Son kontrol: {formatCheck(a.checked_at)}</small>:null}
    </div>:null}

    <section className="card profile-card player-decision-card">
      <div className="player-detail-section-head">
        <div>
          <span className="eyebrow">KARAR ÖZETİ</span>
          <h2>Bu hafta ne bekliyoruz?</h2>
        </div>
        <div className="player-fixture-chip">
          <span>{venue(p?.venue)}</span>
          {opponentId?<Link href={'/teams/'+opponentId}>{opponent}</Link>:<b>{opponent}</b>}
        </div>
      </div>
      <MetricGrid items={decisionMetrics} className="decision-metrics"/>
    </section>

    <div className="profile-grid player-profile-main-grid">
      <section className="card profile-card player-scenario-card">
        <div className="player-detail-section-head">
          <div><span className="eyebrow">PUAN ARALIĞI</span><h2>Olası sonuç dağılımı</h2></div>
        </div>
        <p className="projection-explainer">Tek bir puana takılmak yerine olası sonuç aralığını birlikte oku.</p>
        <MetricGrid items={scenarioMetrics} className="scenario-metrics"/>
        {!isGK?<div className="player-attacking-expectation">
          <div><span>Beklenen gol</span><b>{num(p?.expected_goals)}</b></div>
          <div><span>Beklenen asist</span><b>{num(p?.expected_assists)}</b></div>
        </div>:null}
      </section>

      <section className="card profile-card player-role-card">
        <div className="player-detail-section-head">
          <div><span className="eyebrow">ROL & DAKİKA</span><h2>{r?.signal||'Rol sinyali yok'}</h2></div>
        </div>
        <MetricGrid items={roleMetrics} className="role-metrics"/>
        <p className="player-role-caption">Son maçlardaki kullanım ile önceki dönemi yan yana gösterir; rotasyon değişimini daha kolay görürsün.</p>
      </section>
    </div>

    <section className="card profile-card season-card player-season-card">
      <div className="panel-head">
        <div>
          <span className="eyebrow">SEZON PERFORMANSI</span>
          <h2>MH1–MH{s?.through_gameweek||'—'}</h2>
        </div>
        <span className="pill team-pill">{posLabel(player.position)} için anlamlı istatistikler</span>
      </div>
      <MetricGrid items={seasonMetrics} className={`season-position-metrics position-${player.position.toLowerCase()}`}/>
    </section>

    <section className="card profile-card weekly-history-card player-weekly-card">
      <div className="panel-head">
        <div><span className="eyebrow">HAFTA HAFTA</span><h2>Gerçek Fantezi Puanları</h2></div>
        <Link className="pill" href="/points">Tüm oyuncular →</Link>
      </div>
      <div className="player-form-strip">
        <div><span>Son puan</span><b>{lastWeek?Number(lastWeek.points||0):'—'}</b></div>
        <div><span>Son 3 ort.</span><b>{recentWeeks.length?recentAverage.toFixed(2):'—'}</b></div>
        <div><span>En yüksek</span><b>{closedWeeks.length?bestWeek:'—'}</b></div>
        <div><span>6+ maç</span><b>{Number(s?.six_plus_count||0)}</b></div>
      </div>
      {closedWeeks.length?
        <div className="weekly-history-grid">{closedWeeks.map(h=>
          <div className="week-score" key={h.id||`${player.id}-${h.gameweek}`}>
            <span>MH{h.gameweek}</span>
            <strong>{h.points}</strong>
            <small>{h.minutes!==null&&h.minutes!==undefined?`${Number(h.minutes).toFixed(0)} dk`:'kesinleşmiş puan'}</small>
          </div>
        )}</div>
        :<p className="muted">Henüz kapanmış hafta verisi yok.</p>}
    </section>

    <details className="card profile-card player-advanced-details">
      <summary>
        <span>
          <small>İLERİ MODEL DETAYLARI</small>
          <b>Teknik detayları göster</b>
        </span>
        <i>+</i>
      </summary>
      <div className="player-advanced-body">
        <div className="detail-list">
          <div><span>Oynama olasılığı</span><b>{pct(p?.appearance_probability)}</b></div>
          <div><span>60+ dakika</span><b>{pct(p?.over60_probability)}</b></div>
          <div><span>Temel xFP</span><b>{num(p?.core_xfp)}</b></div>
          <div><span>Beklenen bonus</span><b>{num(p?.x_bonus)}</b></div>
          <div><span>Top25 sıra</span><b>{p?.top25_rank?`#${p.top25_rank}`:'—'}</b></div>
          <div><span>Top25 skor</span><b>{p?.top25_score===null||p?.top25_score===undefined?'—':num(p.top25_score,3)}</b></div>
          <div><span>Veri güveni</span><b>{p?.data_confidence||'—'}</b></div>
          {!isGK?<div><span>Takım gol payı</span><b>{pct(r?.team_goal_share)}</b></div>:null}
          {!isGK?<div><span>Takım asist payı</span><b>{pct(r?.team_assist_share)}</b></div>:null}
        </div>
        <div className="player-model-note"><span>Rol özeti</span><p>{r?.signal||'Belirgin rol değişimi yok.'}</p></div>
      </div>
    </details>
  </div>
}
