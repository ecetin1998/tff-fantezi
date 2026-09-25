import Link from 'next/link'
import { getMatches } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

const difficultyLabel={easy:'Kolay fikstür',medium:'Orta fikstür',hard:'Zor fikstür'}
const profileLabel=total=>total>=3?'Yüksek gol potansiyeli':total<=2?'Düşük gol beklentisi':'Dengeli maç profili'
const profileClass=total=>total>=3?'high':total<=2?'low':'medium'

export default async function Matches(){
  const {matches,run,eloThroughGameweek}=await getMatches()
  return <>
    <div className="section-title">
      <div><span className="eyebrow">MAÇ MODELİ</span><h1>MH{run?.gameweek||'—'} Maç Tahminleri</h1></div>
      <span className="muted">xG • sonuç olasılığı • clean sheet • fantasy maç profili</span>
    </div>

    <div className="grid match-grid modern-match-grid match-analysis-grid">
      {matches.map(m=>{
        const home=Number(m.home_win_probability||0),draw=Number(m.draw_probability||0),away=Number(m.away_win_probability||0)
        const homeXg=Number(m.home_xg||0),awayXg=Number(m.away_xg||0),totalXg=homeXg+awayXg
        const homeCs=Number(m.home_cs_probability||0),awayCs=Number(m.away_cs_probability||0)
        const attackEdge=homeXg===awayXg?null:(homeXg>awayXg?'home':'away')
        const cleanEdge=homeCs===awayCs?null:(homeCs>awayCs?'home':'away')
        return <article className="card match-card modern-match-card match-analysis-card" key={m.match_id}>
          <div className="match-card-top">
            <span className="match-date-label">
              <b>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{weekday:'short',day:'2-digit',month:'short',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</b>
              <em>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</em>
            </span>
            <span className={`match-profile-pill ${profileClass(totalXg)}`}>{profileLabel(totalXg)}</span>
          </div>

          <div className="match-teams">
            <div className="match-team-block">
              <span>EV</span>
              <Link className="match-team-link" style={teamCssVars(m.home_team)} href={'/teams/'+m.home_team_id}><i className="club-dot"/><b>{m.home_team}</b></Link>
              <div className="match-team-meta">
                <em className={'fixture-difficulty '+(m.home_fixture_level||'medium')}>{difficultyLabel[m.home_fixture_level]||'Orta fikstür'}</em>
              </div>
            </div>

            <div className="xg-comparison fantasy-xg-comparison">
              <small>xG TAHMİNİ</small>
              <strong><b>{homeXg.toFixed(2)}</b><em>—</em><b>{awayXg.toFixed(2)}</b></strong>
              <span>Toplam {totalXg.toFixed(2)}</span>
            </div>

            <div className="away match-team-block">
              <span>DEP</span>
              <Link className="match-team-link away-link" style={teamCssVars(m.away_team)} href={'/teams/'+m.away_team_id}><i className="club-dot"/><b>{m.away_team}</b></Link>
              <div className="match-team-meta away-meta">
                <em className={'fixture-difficulty '+(m.away_fixture_level||'medium')}>{difficultyLabel[m.away_fixture_level]||'Orta fikstür'}</em>
              </div>
            </div>
          </div>

          <div className="outcome-bar outcome-bar-labeled" aria-label="Maç sonucu olasılıkları">
            <i className="home" style={{width:(home*100)+'%'}} title={`Ev %${(home*100).toFixed(0)}`}><span><b>{(home*100).toFixed(0)}%</b> Ev</span></i>
            <i className="draw" style={{width:(draw*100)+'%'}} title={`Beraberlik %${(draw*100).toFixed(0)}`}><span><b>{(draw*100).toFixed(0)}%</b> Ber.</span></i>
            <i className="away" style={{width:(away*100)+'%'}} title={`Dep %${(away*100).toFixed(0)}`}><span><b>{(away*100).toFixed(0)}%</b> Dep</span></i>
          </div>

          <div className="match-fantasy-meta fantasy-first-meta">
            <span className={attackEdge==='home'?'edge':''}><small>{m.home_team} hücum</small><b>{homeXg.toFixed(2)} xG</b></span>
            <span className={cleanEdge==='home'?'edge':''}><small>{m.home_team} CS</small><b>{(homeCs*100).toFixed(0)}%</b></span>
            <span className={attackEdge==='away'?'edge':''}><small>{m.away_team} hücum</small><b>{awayXg.toFixed(2)} xG</b></span>
            <span className={cleanEdge==='away'?'edge':''}><small>{m.away_team} CS</small><b>{(awayCs*100).toFixed(0)}%</b></span>
          </div>

          <div className="match-fantasy-note">
            <span>FANTASY OKUMASI</span>
            <p>
              {totalXg>=3
                ? 'Hücum oyuncuları ve tavan arayan seçimler için daha ilgi çekici bir maç profili.'
                : totalXg<=2
                  ? 'Savunma ve kaleci seçimleri için daha anlamlı; hücum tavanı daha sınırlı.'
                  : 'Hücum ve savunma seçimleri arasında dengeli bir maç profili.'}
              {' '}
              {attackEdge==='home'?m.home_team:attackEdge==='away'?m.away_team:'İki takım'} hücum beklentisinde önde.
            </p>
          </div>

          <details className="match-technical-details">
            <summary>Teknik maç detayları <span>+</span></summary>
            <div>
              <small>{m.home_team} Elo</small><b>{m.home_elo||'—'}</b>
              <small>{m.away_team} Elo</small><b>{m.away_elo||'—'}</b>
              <small>Model haftası</small><b>MH{run?.gameweek||'—'}</b>
              <small>Elo veri aralığı</small><b>{eloThroughGameweek?`MH1–MH${eloThroughGameweek}`:'—'}</b>
            </div>
          </details>
        </article>
      })}
    </div>
  </>
}
