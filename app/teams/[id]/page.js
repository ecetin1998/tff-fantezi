import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeamDetail } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300
const pct=v=>(Number(v||0)*100).toFixed(0)+'%'
const num=(v,d=2)=>Number(v||0).toFixed(d)

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
  const matchesPlayed=Math.max(1,Number(s?.matches_played||0))
  const goalsPerMatch=Number(s?.goals_for||0)/matchesPlayed
  const concededPerMatch=Number(s?.goals_against||0)/matchesPlayed
  const shotsPerMatch=Number(s?.shots||0)/matchesPlayed
  const oppSotPerMatch=Number(s?.opponent_sot||0)/matchesPlayed
  const finishingDelta=Number(s?.goals_for||0)-Number(s?.xg_total||0)
  const defensiveDelta=Number(s?.xga_total||0)-Number(s?.goals_against||0)
  const xgDiffPerMatch=Number(s?.xg_diff||0)/matchesPlayed

  return <div className="team-detail-page" style={teamCssVars(team.name)}>
    <Link href="/teams" className="back-link">← Takımlara dön</Link>
    <section className="card team-detail-hero">
      <div className="team-detail-mark">{team.short_name||team.name.slice(0,3).toUpperCase()}</div>
      <div className="team-detail-copy"><span className="eyebrow">TAKIM PROFİLİ</span><h1>{team.name}</h1><p>MH1–MH{s?.through_gameweek||'—'} sezon görünümü • {players.length} aktif oyuncu</p></div>
      <div className="team-detail-current"><span>MH{run?.gameweek||'—'} rakibi</span>{opponent?<Link href={'/teams/'+opponent.id}>{opponent.name}</Link>:<b>—</b>}<small>{isHome?'Ev':'Dep'}</small></div>
    </section>

    <section className="team-detail-stat-grid">
      <div className="card"><span>Maç</span><b>{s?.matches_played||0}</b><small>sezon</small></div>
      <div className="card"><span>Gol / maç</span><b>{num(goalsPerMatch)}</b><small>{s?.goals_for||0} gol</small></div>
      <div className="card"><span>xG / maç</span><b>{num(s?.xg_per_match)}</b><small>{num(s?.xg_total)} toplam</small></div>
      <div className="card"><span>Yenen / maç</span><b>{num(concededPerMatch)}</b><small>{s?.goals_against||0} gol</small></div>
      <div className="card"><span>xGA / maç</span><b>{num(s?.xga_per_match)}</b><small>{num(s?.xga_total)} toplam</small></div>
      <div className="card xg-diff-stat"><span>xG − xGA / maç</span><b>{xgDiffPerMatch>0?'+':''}{num(xgDiffPerMatch)}</b><small>toplam {Number(s?.xg_diff||0)>0?'+':''}{num(s?.xg_diff)}</small></div>
    </section>

    <div className="profile-grid team-detail-split">
      <section className="card profile-card team-current-fixture">
        <span className="eyebrow">BU HAFTA</span>
        <div className="team-fixture-versus"><div><small>{isHome?'EV':'DEP'}</small><b>{team.name}</b></div><span>Rakip</span><div><small>{isHome?'DEP':'EV'}</small>{opponent?<Link href={'/teams/'+opponent.id}><b>{opponent.name}</b></Link>:<b>—</b>}</div></div>
        <div className="profile-mini-grid"><div><span>xG</span><b>{num(teamXg)}</b></div><div><span>Rakip xG</span><b>{num(oppXg)}</b></div><div><span>Galibiyet</span><b>{pct(win)}</b></div><div><span>Gol yememe</span><b>{pct(cs)}</b></div></div>
      </section>
      <section className="card profile-card team-profile-breakdown">
        <span className="eyebrow">SEZON PROFİLİ</span>
        <div className="team-profile-columns">
          <div className="team-profile-group">
            <div className="team-profile-group-head"><span>HÜCUM</span><b>{s?.goals_for||0} gol</b></div>
            <div className="detail-list">
              <div><span>Toplam xG</span><b>{num(s?.xg_total)}</b></div>
              <div><span>Şut / maç</span><b>{num(shotsPerMatch,1)}</b></div>
              <div><span>Gol − xG</span><b>{finishingDelta>0?'+':''}{num(finishingDelta)}</b></div>
            </div>
          </div>
          <div className="team-profile-group">
            <div className="team-profile-group-head"><span>SAVUNMA & BASKI</span><b>{s?.goals_against||0} gol yedi</b></div>
            <div className="detail-list">
              <div><span>Toplam xGA</span><b>{num(s?.xga_total)}</b></div>
              <div><span>Rakip isabetli şut / maç</span><b>{num(oppSotPerMatch,1)}</b></div>
              <div><span>xGA − yenen gol</span><b>{defensiveDelta>0?'+':''}{num(defensiveDelta)}</b></div>
              <div><span>PPDA</span><b>{num(s?.ppda)}</b></div>
            </div>
          </div>
        </div>
        {s?.coverage_note?<small className="team-profile-coverage">{s.coverage_note}</small>:null}
      </section>
    </div>

    <section className="card team-roster-section">
      <div className="panel-head team-roster-head">
        <div><span className="eyebrow">OYUNCU HAVUZU</span><h2>{team.name} kadrosu</h2></div>
        <div className="team-roster-summary">
          <span><small>AKTİF HAVUZ</small><b>{players.length} oyuncu</b></span>
        </div>
      </div>
      <div className="team-roster-grid">{players.map(p=><Link href={'/players/'+p.id} className="team-roster-player" key={p.id}>
        <span className={'pos '+p.position}>{p.position==='GK'?'KL':p.position==='MID'?'OS':p.position==='FWD'?'FOR':p.position}</span>
        <div className="team-roster-copy">
          <b>{p.full_name}</b>
          <small><span>{Number(p.price||0).toFixed(1)}m</span>{p.availability?.reason?<><i>•</i><span>{p.availability.reason}</span></>:null}</small>
        </div>
        <div className="team-roster-xfp"><strong>{num(p.projection?.xfp)}</strong><small>xFP</small></div>
      </Link>)}</div>
    </section>

    <section className="card team-history-section">
      <div className="panel-head"><div><span className="eyebrow">MAÇ GEÇMİŞİ</span><h2>Sezon sonuçları</h2></div><span className="muted">{played.length} tamamlanan maç</span></div>
      <div className="team-history-list">{played.map(m=>{
        const home=Number(m.home_team_id)===Number(team.id),oppId=home?m.away_team_id:m.home_team_id,oppName=home?m.away_team_name:m.home_team_name
        const gf=home?m.home_goals:m.away_goals,ga=home?m.away_goals:m.home_goals,result=gf>ga?'G':gf===ga?'B':'M'
        return <div className="team-history-row" key={m.match_id}><span>MH{m.gameweek}</span><i className={'result '+result}>{result}</i><b>{home?'İç':'Dep'} • <Link href={'/teams/'+oppId}>{oppName}</Link></b><strong>{gf} - {ga}</strong></div>
      })}</div>
    </section>

    <section className="card team-fantasy-history">
      <div className="panel-head"><div><span className="eyebrow">FANTASY ÜRETİMİ</span><h2>Takımın haftalık toplam puanı</h2></div></div>
      <div className="team-week-points">{fantasyWeeks.map(([gw,pts])=><div key={gw}><span>MH{gw}</span><b>{pts}</b></div>)}</div>
    </section>
  </div>
}
