import Link from 'next/link'
import { getMatches } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

export default async function Teams(){
  const {run,matches}=await getMatches()
  const teams=matches.flatMap(m=>[
    {id:m.home_team_id,name:m.home_team,opponent:m.away_team,venue:'İç saha',xg:m.home_xg,oppXg:m.away_xg,win:m.home_win_probability,cs:m.home_cs_probability},
    {id:m.away_team_id,name:m.away_team,opponent:m.home_team,venue:'Deplasman',xg:m.away_xg,oppXg:m.home_xg,win:m.away_win_probability,cs:m.away_cs_probability},
  ]).sort((a,b)=>a.name.localeCompare(b.name,'tr'))

  return <>
    <div className="section-title">
      <div><span className="eyebrow">TAKIM ANALİZİ</span><h1>MH{run?.gameweek||'—'} Takım & Fikstür Görünümü</h1></div>
      <span className="muted">{teams.length} takım • detay için takıma dokun</span>
    </div>
    <div className="team-grid">
      {teams.map(t=><Link href={'/teams/'+t.id} className="card team-card team-accent-card team-overview-card" style={teamCssVars(t.name)} key={t.id}>
        <div className="team-card-head"><h2>{t.name}</h2><span className="pill">{t.venue}</span></div>
        <p className="muted">Rakip: {t.opponent}</p>
        <div className="team-metrics">
          <div><span>xG</span><b>{Number(t.xg||0).toFixed(2)}</b></div>
          <div><span>Rakip xG</span><b>{Number(t.oppXg||0).toFixed(2)}</b></div>
          <div><span>Galibiyet</span><b>{(Number(t.win||0)*100).toFixed(1)}%</b></div>
          <div><span>CS</span><b>{(Number(t.cs||0)*100).toFixed(1)}%</b></div>
        </div>
        <span className="team-card-open">Takım profili →</span>
      </Link>)}
    </div>
  </>
}
