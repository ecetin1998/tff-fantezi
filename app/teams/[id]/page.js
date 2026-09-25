import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeamDetail } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'
import TeamRoster from '@/components/TeamRoster'

export const revalidate=300

const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

export default async function TeamPage({params}){
  const {id}=await params
  const data=await getTeamDetail(id)
  if(!data) notFound()

  const {team,run,season:s,history,currentMatch,opponent,players,fantasyByGameweek}=data
  const isHome=currentMatch?Number(currentMatch.home_team_id)===Number(team.id):false
  const teamXg=currentMatch?(isHome?currentMatch.home_xg:currentMatch.away_xg):null
  const oppXg=currentMatch?(isHome?currentMatch.away_xg:currentMatch.home_xg):null
  const win=currentMatch?(isHome?currentMatch.home_win_probability:currentMatch.away_win_probability):null
  const cs=currentMatch?(isHome?currentMatch.home_cs_probability:currentMatch.away_cs_probability):null

  const played=(history||[]).filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.away_goals!==null&&m.away_goals!==undefined)
  const fantasyWeeks=Object.entries(fantasyByGameweek||{}).sort((a,b)=>Number(a[0])-Number(b[0]))
  const matchesPlayed=Number(s?.matches_played||0)
  const safeMatches=Math.max(1,matchesPlayed)
  const goalsPerMatch=Number(s?.goals_for||0)/safeMatches
  const concededPerMatch=Number(s?.goals_against||0)/safeMatches
  const shotsPerMatch=Number(s?.shots||0)/safeMatches
  const oppSotPerMatch=Number(s?.opponent_sot||0)/safeMatches
  const finishingDelta=Number(s?.goals_for||0)-Number(s?.xg_total||0)
  const defensiveDelta=Number(s?.xga_total||0)-Number(s?.goals_against||0)
  const xgDiffPerMatch=Number(s?.xg_diff||0)/safeMatches

  const sortedPlayers=[...(players||[])].sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))
  const topPicks=sortedPlayers.slice(0,3)
  const fantasyTotal=fantasyWeeks.reduce((sum,[,pts])=>sum+Number(pts||0),0)
  const recentFantasyWeeks=fantasyWeeks.slice(-3)
  const recentFantasyAvg=recentFantasyWeeks.length
    ? recentFantasyWeeks.reduce((sum,[,pts])=>sum+Number(pts||0),0)/recentFantasyWeeks.length
    : 0
  const lastFantasyWeek=fantasyWeeks.at(-1)
  const bestFantasyWeek=fantasyWeeks.length
    ? Math.max(...fantasyWeeks.map(([,pts])=>Number(pts||0)))
    : 0

  return <div className="team-detail-page team-detail-v2" style={teamCssVars(team.name)}>
    <Link href="/teams" className="back-link">← Takım Analizi'ne dön</Link>

    <section className="card team-detail-hero team-detail-hero-v2">
      <div className="team-detail-mark">{team.short_name||team.name.slice(0,3).toUpperCase()}</div>
      <div className="team-detail-copy">
        <span className="eyebrow">TAKIM ANALİZİ</span>
        <h1>{team.name}</h1>
        <p>MH1–MH{s?.through_gameweek||'—'} • {players.length} aktif oyuncu</p>
        <div className="team-hero-pills">
          <span>{matchesPlayed} maç</span>
          <span>{num(s?.xg_per_match)} xG/maç</span>
          <span>{num(s?.xga_per_match)} xGA/maç</span>
          <span>{fantasyTotal} fantasy puanı</span>
        </div>
      </div>
      <div className="team-detail-current">
        <span>MH{run?.gameweek||'—'} rakibi</span>
        {opponent?<Link href={'/teams/'+opponent.id}>{opponent.name}</Link>:<b>—</b>}
        <small>{currentMatch?(isHome?'Ev':'Dep'):'—'}</small>
      </div>
    </section>

    <section className="card profile-card team-week-decision">
      <div className="team-detail-section-head">
        <div>
          <span className="eyebrow">BU HAFTA</span>
          <h2>Fantasy karar özeti</h2>
        </div>
        <div className="team-fixture-badge">
          <span>{currentMatch?(isHome?'EV':'DEP'):'—'}</span>
          {opponent?<Link href={'/teams/'+opponent.id}>{opponent.name}</Link>:<b>Rakip yok</b>}
        </div>
      </div>

      <div className="team-week-metrics">
        <div><span>Takım xG</span><b>{num(teamXg)}</b><small>gol üretim beklentisi</small></div>
        <div><span>Rakip xG</span><b>{num(oppXg)}</b><small>savunma riski</small></div>
        <div><span>Galibiyet</span><b>{pct(win)}</b><small>maç kazanma ihtimali</small></div>
        <div><span>Clean sheet</span><b>{pct(cs)}</b><small>savunma getirisi</small></div>
      </div>

      <div className="team-top-picks">
        <div className="team-top-picks-head"><span>ÖNE ÇIKANLAR</span><small>xFP'ye göre ilk 3</small></div>
        <div className="team-top-picks-grid">
          {topPicks.map((p,i)=><Link href={'/players/'+p.id} className="team-top-pick" key={p.id}>
            <span className={'pos '+p.position}>{posLabel(p.position)}</span>
            <div>
              <small>#{i+1}</small>
              <b>{p.full_name}</b>
              <em>{Number(p.price||0).toFixed(1)}m</em>
            </div>
            <strong>{num(p.projection?.xfp)}<small>xFP</small></strong>
          </Link>)}
        </div>
      </div>
    </section>

    <section className="team-detail-stat-grid team-core-stat-grid">
      <div className="card"><span>Gol / maç</span><b>{num(goalsPerMatch)}</b><small>{s?.goals_for||0} gol</small></div>
      <div className="card"><span>xG / maç</span><b>{num(s?.xg_per_match)}</b><small>{num(s?.xg_total)} toplam</small></div>
      <div className="card"><span>Yenen / maç</span><b>{num(concededPerMatch)}</b><small>{s?.goals_against||0} gol</small></div>
      <div className="card"><span>xGA / maç</span><b>{num(s?.xga_per_match)}</b><small>{num(s?.xga_total)} toplam</small></div>
      <div className="card xg-diff-stat"><span>xG farkı / maç</span><b>{xgDiffPerMatch>0?'+':''}{num(xgDiffPerMatch)}</b><small>toplam {Number(s?.xg_diff||0)>0?'+':''}{num(s?.xg_diff)}</small></div>
    </section>

    <section className="card team-roster-section team-roster-v2">
      <div className="panel-head team-roster-head">
        <div>
          <span className="eyebrow">OYUNCULAR</span>
          <h2>Fantasy oyuncu havuzu</h2>
        </div>
        <div className="team-roster-summary">
          <span><small>AKTİF</small><b>{players.length} oyuncu</b></span>
        </div>
      </div>
      <TeamRoster players={sortedPlayers}/>
    </section>

    <div className="profile-grid team-detail-history-grid">
      <section className="card team-history-section">
        <div className="panel-head">
          <div><span className="eyebrow">MAÇ GEÇMİŞİ</span><h2>Sezon sonuçları</h2></div>
          <span className="muted">{played.length} maç</span>
        </div>
        <div className="team-history-list">{played.map(m=>{
          const home=Number(m.home_team_id)===Number(team.id)
          const oppId=home?m.away_team_id:m.home_team_id
          const oppName=home?m.away_team_name:m.home_team_name
          const gf=home?m.home_goals:m.away_goals
          const ga=home?m.away_goals:m.home_goals
          const result=gf>ga?'G':gf===ga?'B':'M'
          return <div className="team-history-row" key={m.match_id}>
            <span>MH{m.gameweek}</span>
            <i className={'result '+result}>{result}</i>
            <b>{home?'İç':'Dep'} • <Link href={'/teams/'+oppId}>{oppName}</Link></b>
            <strong>{gf} - {ga}</strong>
          </div>
        })}</div>
      </section>

      <section className="card team-fantasy-history team-fantasy-history-v2">
        <div className="panel-head">
          <div><span className="eyebrow">FANTASY FORMU</span><h2>Haftalık takım üretimi</h2></div>
        </div>
        <div className="team-fantasy-summary">
          <div><span>Son hafta</span><b>{lastFantasyWeek?Number(lastFantasyWeek[1]||0):'—'}</b></div>
          <div><span>Son 3 ort.</span><b>{recentFantasyWeeks.length?recentFantasyAvg.toFixed(1):'—'}</b></div>
          <div><span>En yüksek</span><b>{fantasyWeeks.length?bestFantasyWeek:'—'}</b></div>
          <div><span>Toplam</span><b>{fantasyTotal}</b></div>
        </div>
        <div className="team-week-points">
          {fantasyWeeks.map(([gw,pts])=><div key={gw}><span>MH{gw}</span><b>{pts}</b></div>)}
        </div>
      </section>
    </div>

    <details className="card profile-card team-advanced-details">
      <summary>
        <span><small>İLERİ TAKIM İSTATİSTİKLERİ</small><b>Teknik sezon profilini göster</b></span>
        <i>+</i>
      </summary>
      <div className="team-advanced-body">
        <div className="team-advanced-group">
          <div className="team-profile-group-head"><span>HÜCUM</span><b>{s?.goals_for||0} gol</b></div>
          <div className="detail-list">
            <div><span>Toplam xG</span><b>{num(s?.xg_total)}</b></div>
            <div><span>Şut / maç</span><b>{num(shotsPerMatch,1)}</b></div>
            <div><span>Gol − xG</span><b>{finishingDelta>0?'+':''}{num(finishingDelta)}</b></div>
          </div>
        </div>
        <div className="team-advanced-group">
          <div className="team-profile-group-head"><span>SAVUNMA & BASKI</span><b>{s?.goals_against||0} gol yedi</b></div>
          <div className="detail-list">
            <div><span>Toplam xGA</span><b>{num(s?.xga_total)}</b></div>
            <div><span>Rakip isabetli şut / maç</span><b>{num(oppSotPerMatch,1)}</b></div>
            <div><span>xGA − yenen gol</span><b>{defensiveDelta>0?'+':''}{num(defensiveDelta)}</b></div>
            <div><span>PPDA</span><b>{num(s?.ppda)}</b></div>
          </div>
        </div>
        {s?.coverage_note?<small className="team-profile-coverage">{s.coverage_note}</small>:null}
      </div>
    </details>
  </div>
}
