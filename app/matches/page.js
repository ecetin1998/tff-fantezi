import Link from 'next/link'
import { getMatches } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

export default async function Matches(){
  const {matches,run}=await getMatches()
  return <>
    <div className="section-title">
      <div><span className="eyebrow">MAÇ MODELİ</span><h1>GW{run?.gameweek||'—'} Maç Tahminleri</h1></div>
      <span className="muted">xG • 1X2 • KG Var • 2.5 Üst</span>
    </div>
    <div className="grid match-grid modern-match-grid">
      {matches.map(m=>{
        const home=Number(m.home_win_probability||0),draw=Number(m.draw_probability||0),away=Number(m.away_win_probability||0)
        return <article className="card match-card modern-match-card" key={m.match_id}>
          <div className="match-card-top">
            <span>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</span>
            <b>GW{run?.gameweek||'—'}</b>
          </div>
          <div className="match-teams">
            <div><span>EV</span><Link className="match-team-link" style={teamCssVars(m.home_team)} href={'/teams/'+m.home_team_id}><i className="club-dot"/><b>{m.home_team}</b></Link></div>
            <div className="xg-comparison"><small>xG TAHMİNİ</small><strong><b>{Number(m.home_xg||0).toFixed(2)}</b><em>—</em><b>{Number(m.away_xg||0).toFixed(2)}</b></strong></div>
            <div className="away"><span>DEP</span><Link className="match-team-link away-link" style={teamCssVars(m.away_team)} href={'/teams/'+m.away_team_id}><i className="club-dot"/><b>{m.away_team}</b></Link></div>
          </div>
          <div className="outcome-labels outcome-labels-top"><span><small>{(home*100).toFixed(0)}%</small><b>1</b></span><span><small>{(draw*100).toFixed(0)}%</small><b>X</b></span><span><small>{(away*100).toFixed(0)}%</small><b>2</b></span></div>
          <div className="outcome-bar"><i className="home" style={{width:(home*100)+'%'}}/><i className="draw" style={{width:(draw*100)+'%'}}/><i className="away" style={{width:(away*100)+'%'}}/></div>
          <div className="match-chips"><span>KG Var <b>{(Number(m.btts_probability||0)*100).toFixed(0)}%</b></span><span>2.5 Üst <b>{(Number(m.over25_probability||0)*100).toFixed(0)}%</b></span></div>
        </article>
      })}
    </div>
  </>
}
