import Link from 'next/link'
import { getMatches } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

const difficultyLabel={easy:'Kolay fikstür',medium:'Orta fikstür',hard:'Zor fikstür'}

export default async function Matches(){
  const {matches,run,eloThroughGameweek}=await getMatches()
  return <>
    <div className="section-title">
      <div><span className="eyebrow">MAÇ MODELİ</span><h1>MH{run?.gameweek||'—'} Maç Tahminleri</h1></div>
      <span className="muted">xG • maç olasılığı • Elo • fikstür zorluğu</span>
    </div>
    <div className="grid match-grid modern-match-grid">
      {matches.map(m=>{
        const home=Number(m.home_win_probability||0),draw=Number(m.draw_probability||0),away=Number(m.away_win_probability||0)
        const totalXg=Number(m.home_xg||0)+Number(m.away_xg||0)
        return <article className="card match-card modern-match-card" key={m.match_id}>
          <div className="match-card-top">
            <span className="match-date-label">
              <b>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{weekday:'short',day:'2-digit',month:'short',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</b>
              <em>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</em>
            </span>
            <b>MH{run?.gameweek||'—'}</b>
          </div>

          <div className="match-teams">
            <div className="match-team-block">
              <span>EV</span>
              <Link className="match-team-link" style={teamCssVars(m.home_team)} href={'/teams/'+m.home_team_id}><i className="club-dot"/><b>{m.home_team}</b></Link>
              <div className="match-team-meta">
                <small>Elo {m.home_elo||'—'}</small>
                <em className={'fixture-difficulty '+(m.home_fixture_level||'medium')}>{difficultyLabel[m.home_fixture_level]||'Orta fikstür'}</em>
              </div>
            </div>

            <div className="xg-comparison">
              <small>xG TAHMİNİ</small>
              <strong><b>{Number(m.home_xg||0).toFixed(2)}</b><em>—</em><b>{Number(m.away_xg||0).toFixed(2)}</b></strong>
            </div>

            <div className="away match-team-block">
              <span>DEP</span>
              <Link className="match-team-link away-link" style={teamCssVars(m.away_team)} href={'/teams/'+m.away_team_id}><i className="club-dot"/><b>{m.away_team}</b></Link>
              <div className="match-team-meta away-meta">
                <small>Elo {m.away_elo||'—'}</small>
                <em className={'fixture-difficulty '+(m.away_fixture_level||'medium')}>{difficultyLabel[m.away_fixture_level]||'Orta fikstür'}</em>
              </div>
            </div>
          </div>

          <div className="outcome-bar outcome-bar-labeled" aria-label="Maç sonucu olasılıkları">
            <i className="home" style={{width:(home*100)+'%'}} title={`Ev %${(home*100).toFixed(0)}`}><span><b>{(home*100).toFixed(0)}%</b> Ev</span></i>
            <i className="draw" style={{width:(draw*100)+'%'}} title={`Beraberlik %${(draw*100).toFixed(0)}`}><span><b>{(draw*100).toFixed(0)}%</b> Ber.</span></i>
            <i className="away" style={{width:(away*100)+'%'}} title={`Dep %${(away*100).toFixed(0)}`}><span><b>{(away*100).toFixed(0)}%</b> Dep</span></i>
          </div>

          <div className="match-fantasy-meta">
            <span><small>Ev gol yememe</small><b>{(Number(m.home_cs_probability||0)*100).toFixed(0)}%</b></span>
            <span className="xg-total-meta"><small>Toplam xG</small><b>{totalXg.toFixed(2)}</b></span>
            <span><small>Dep gol yememe</small><b>{(Number(m.away_cs_probability||0)*100).toFixed(0)}%</b></span>
          </div>
          {eloThroughGameweek?<small className="elo-note">Elo: MH1–MH{eloThroughGameweek} sonuçları</small>:null}
        </article>
      })}
    </div>
  </>
}
