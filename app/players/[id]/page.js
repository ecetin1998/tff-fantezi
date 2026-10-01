import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlayerDetail } from '@/lib/data'
import ProPlayerAnalysis from '@/components/ProPlayerAnalysis'
import { teamCssVars } from '@/lib/teamThemes'
import { availabilityCompactNote, availabilityIsIssue } from '@/lib/availability'
import {playerLabel,predictionConfidenceLabel} from '@/lib/playerPresentation'
import {playerRoleLabel} from '@/lib/playerRole'

export const revalidate=300
export const dynamic='force-static'
export const dynamicParams=true
export async function generateStaticParams(){ return [] }
export async function generateMetadata({params}){
  const {id}=await params
  const data=await getPlayerDetail(id)
  if(!data)notFound()
  return {title:data.player.full_name+' • Oyuncu Analizi',description:data.player.full_name+' için xFP, dakika, rol ve haftalık fantasy performansı.'}
}

const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
const num=(v,d=2)=>Number(v||0).toFixed(d)
const venue=v=>v==='HOME'?'Ev':v==='AWAY'?'Dep':'—'
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
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

  const {run,player,projection:p,availability:a,season:s,weekly,matches=[]}=data
  const closedWeeks=[...(weekly||[])].sort((x,y)=>Number(x.gameweek||0)-Number(y.gameweek||0))
  const playedWeeks=closedWeeks.filter(w=>Number(w.minutes||0)>0)
  const played=Number(s?.matches_played ?? playedWeeks.length)
  const actual=Number(s?.actual_points ?? closedWeeks.reduce((sum,w)=>sum+Number(w.points||0),0))
  const average=played?actual/played:0
  const fixtures=(matches||[]).map(match=>({
    ...match,
    opponentId:Number(match.home_team_id)===Number(player.team_id)?Number(match.away_team_id):Number(match.home_team_id),
    opponentName:match.opponent?.name||'—',
    venue:Number(match.home_team_id)===Number(player.team_id)?'HOME':'AWAY'
  }))
  const opponent=p?.opponent_name || fixtures.map(f=>f.opponentName).filter(Boolean).join(' + ') || '—'
  const hasAvailabilityIssue=availabilityIsIssue(a)
  const hasAvailabilityInfo=a && (hasAvailabilityIssue || a.availability_type==='return' || a.expected_return_date || a.suspension_fixture || a.canonical_reason)
  const availabilityNote=availabilityCompactNote(a)
  const isGK=player.position==='GK'
  const isDEF=player.position==='DEF'
  const themeStyle=teamCssVars(player.team)
  const detailedRole=playerRoleLabel(player)

  const recentWeeks=playedWeeks.slice(-3)
  const recentAverage=recentWeeks.length?recentWeeks.reduce((sum,w)=>sum+Number(w.points||0),0)/recentWeeks.length:0
  const lastWeek=closedWeeks.at(-1)
  const bestWeek=closedWeeks.length?Math.max(...closedWeeks.map(w=>Number(w.points||0))):0

  const decisionMetrics=[
    {label:'xFP',value:num(p?.xfp),note:`MH${run?.gameweek||'—'} beklenen`,emphasis:true},
    {label:'İlk 11',value:pct(p?.xi_probability),note:'başlama ihtimali'},
    {label:'xDakika',value:num(p?.x_minutes,0),note:'beklenen süre'},
    {label:'F/P',value:num(p?.value_score),note:'fiyat verimliliği'},
  ]



  const seasonMetrics=[
    {label:'Toplam puan',value:num(actual,0),emphasis:true},
    {label:'Puan / maç',value:average.toFixed(2)},
    {label:'Maç',value:played},
    {label:'İlk 11',value:Number(s?.starts||0)},
    {label:'Dakika',value:num(s?.minutes,0)},
  ]
  if(isGK){
    seasonMetrics.push(
      {label:'Gol yemeden',value:Number(s?.clean_sheets||0)},
      {label:'Kurtarış',value:Number(s?.saves||0)}
    )
  }else{
    seasonMetrics.push(
      {label:'Gol',value:Number(s?.goals||0)},
      {label:'Asist',value:Number(s?.assists||0)}
    )
    if(isDEF)seasonMetrics.push({label:'Gol yemeden',value:Number(s?.clean_sheets||0)})
  }
  seasonMetrics.push(
    {label:'Sarı kart',value:Number(s?.yellow_cards||0)},
    {label:'Kırmızı kart',value:Number(s?.red_cards||0)}
  )


  return <div className="team-player-page player-detail-v2" style={themeStyle}>
    <Link href="/players" className="back-link">← Oyuncu Analizi'ne dön</Link>

    <section className="card player-hero-card team-profile-hero player-detail-hero">
      <div className="player-hero-main">
        <span className={`pos ${player.position} team-pos-badge`}>{posLabel(player.position)}</span>
        <div className="player-detail-identity">
          <span className="eyebrow">OYUNCU ANALİZİ</span>
          <h1>{playerLabel(player)}</h1>
          <p>
            <Link className="team-inline-link" href={'/teams/'+player.team_id}>{player.team}</Link>
            <span>•</span><b>{Number(player.price||0).toFixed(1)}m</b>{detailedRole?<><span>•</span><b>{detailedRole}</b></>:null}
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
      </div>
    </div>:null}

    <section className="card profile-card player-decision-card">
      <div className="player-detail-section-head">
        <div>
          <span className="eyebrow">KARAR ÖZETİ</span>
          <h2>Bu hafta ne bekliyoruz?</h2>
        </div>
        <div className="player-fixture-list">
          {fixtures.length?fixtures.map(f=><div className="player-fixture-chip" key={f.match_id}>
            <span>{venue(f.venue)}</span>
            {f.opponentId?<Link href={'/teams/'+f.opponentId}>{f.opponentName}</Link>:<b>{f.opponentName}</b>}
          </div>):<div className="player-fixture-chip"><span>{venue(p?.venue)}</span><b>{opponent}</b></div>}
        </div>
      </div>
      <MetricGrid items={decisionMetrics} className="decision-metrics"/>
    </section>

    <ProPlayerAnalysis playerId={player.id} isGK={isGK} isDEF={isDEF} detailedRole={detailedRole}/>

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
        <div><span>Oynadığı maç</span><b>{played}</b></div>
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


  </div>
}
