import { getMatches } from '@/lib/data'
export const revalidate=300
export default async function Teams(){
  const {run,matches}=await getMatches()
  const teams=matches.flatMap(m=>[
    {name:m.home_team,opponent:m.away_team,venue:'İç saha',xg:m.home_xg,oppXg:m.away_xg,win:m.home_win_probability,cs:m.home_cs_probability,kickoff:m.kickoff_at},
    {name:m.away_team,opponent:m.home_team,venue:'Deplasman',xg:m.away_xg,oppXg:m.home_xg,win:m.away_win_probability,cs:m.away_cs_probability,kickoff:m.kickoff_at},
  ]).sort((a,b)=>a.name.localeCompare(b.name,'tr'))
  return <><div className="section-title"><div><span className="eyebrow">TAKIM & FİKSTÜR</span><h1>GW{run?.gameweek||'—'} Takım Görünümü</h1></div><span className="muted">{teams.length} takım</span></div>
  <div className="team-grid">{teams.map(t=><article className="card team-card" key={t.name}><div className="team-card-head"><h2>{t.name}</h2><span className="pill">{t.venue}</span></div><p className="muted">vs {t.opponent}</p><div className="team-metrics"><div><span>xG</span><b>{Number(t.xg||0).toFixed(2)}</b></div><div><span>Rakip xG</span><b>{Number(t.oppXg||0).toFixed(2)}</b></div><div><span>Galibiyet</span><b>{(Number(t.win||0)*100).toFixed(1)}%</b></div><div><span>CS</span><b>{(Number(t.cs||0)*100).toFixed(1)}%</b></div></div></article>)}</div></>
}