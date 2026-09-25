'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { teamCssVars } from '@/lib/teamThemes'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

export default function PlayersTable({ players }){
  const [q,setQ]=useState('')
  const [pos,setPos]=useState('')
  const [team,setTeam]=useState('')
  const [sort,setSort]=useState('xfp')
  const [dir,setDir]=useState(-1)
  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])

  const rows=useMemo(()=>{
    const out=players.filter(p=>
      (!pos||p.position===pos) &&
      (!team||p.team===team) &&
      (!q||(`${p.full_name} ${p.display_name||''} ${p.team} ${p.projection?.opponent_name||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
    )
    const val=(p,k)=>{
      if(k==='name')return p.full_name
      if(k==='team')return p.team
      if(k==='pos')return p.position
      if(k==='opp')return p.projection?.opponent_name||''
      if(k==='price')return Number(p.price)
      if(k==='xi')return Number(p.projection?.xi_probability||0)
      if(k==='minutes')return Number(p.projection?.x_minutes||0)
      if(k==='core')return Number(p.projection?.core_xfp||0)
      if(k==='bonus')return Number(p.projection?.x_bonus||0)
      if(k==='p25')return Number(p.projection?.p25||0)
      if(k==='p75')return Number(p.projection?.p75||0)
      if(k==='p90')return Number(p.projection?.p90||0)
      if(k==='six')return Number(p.projection?.six_plus_probability||0)
      if(k==='top25')return Number(p.projection?.top25_score||0)
      if(k==='top25rank')return -Number(p.projection?.top25_rank||999)
      if(k==='xg')return Number(p.projection?.expected_goals||0)
      if(k==='xa')return Number(p.projection?.expected_assists||0)
      if(k==='value')return Number(p.projection?.value_score||0)
      return Number(p.projection?.xfp||0)
    }
    return [...out].sort((a,b)=>{
      const av=val(a,sort),bv=val(b,sort)
      return typeof av==='string' ? dir*av.localeCompare(bv,'tr') : dir*(av-bv)
    })
  },[players,q,pos,team,sort,dir])

  const head=(k,label)=><th onClick={()=>{if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
  const num=(v,d=2)=>Number(v||0).toFixed(d)
  const formatCheck=(value)=>{
    if(!value)return ''
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value))
    const get=t=>parts.find(x=>x.type===t)?.value||''
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
  }
  const playerNote=(p)=>{
    const a=p.availability
    const issue=a && (['injuries','suspensions'].includes(a.availability_type) || Number(a.availability_probability??1)<.99)
    if(issue&&a.reason){
      const checked=formatCheck(a.checked_at)
      return checked ? `${a.reason} • ${checked}` : a.reason
    }
    return ''
  }

  return <>
    <div className="filters player-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya rakip ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={pos} onChange={e=>setPos(e.target.value)}>
        <option value="">Tüm mevkiler</option><option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
      </select>
      <select className="mobile-sort-select" value={sort} onChange={e=>{setSort(e.target.value);setDir(-1)}}>
        <option value="xfp">xFP'ye göre</option><option value="top25">Top25 skoruna göre</option><option value="top25rank">Top25 sırasına göre</option><option value="value">F/P'ye göre</option><option value="minutes">Dakikaya göre</option><option value="six">6+ ihtimaline göre</option><option value="price">Fiyata göre</option>
      </select>
    </div>

    <div className="table-summary"><b>{rows.length}</b> oyuncu • detay için oyuncuya dokun</div>
    <div className="projection-legend">Tahmin aralığı: <b>Temkinli</b> = alt çeyrek • <b>İyi senaryo</b> = üst çeyreğe giriş • <b>Tavan</b> = üst %10'luk sonuç seviyesi</div>

    <div className="card table-wrap desktop-player-table"><table><thead><tr>
      <th className="rank-col">#</th>{head('name','Oyuncu')}{head('team','Takım')}{head('pos','Mevki')}{head('opp','Rakip')}<th>E/D</th>
      {head('price','Fiyat')}{head('xi','İlk 11')}{head('minutes','xDk')}{head('xfp','xFP')}{head('top25rank','Top25 Sıra')}{head('top25','Top25 Skor')}{head('core','Temel xFP')}{head('bonus','Beklenen bonus')}
      {head('p25','Temkinli')}{head('p75','İyi senaryo')}{head('p90','Tavan')}{head('six','6+ %')}{head('xg','xG')}{head('xa','xA')}{head('value','F/P')}<th>Güven</th>
    </tr></thead><tbody>{rows.map((p,i)=><tr className="team-player-row" style={teamCssVars(p.team)} key={p.id}>
      <td className="rank-col">#{i+1}</td>
      <td><Link className="player-link team-player-link" href={'/players/'+p.id}><i className="club-dot"/><b>{p.full_name}</b></Link>{playerNote(p)?<small className="cell-note">{playerNote(p)}</small>:null}</td>
      <td><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></td><td><span className={`pos ${p.position}`}>{posLabel(p.position)}</span></td><td>{p.projection?.opponent_name||'—'}</td><td>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</td>
      <td>{num(p.price,1)}m</td><td>{pct(p.projection?.xi_probability)}</td><td>{num(p.projection?.x_minutes,1)}</td><td><b>{num(p.projection?.xfp)}</b></td><td><b>#{Number(p.projection?.top25_rank||0)||'—'}</b></td><td>{num(p.projection?.top25_score,3)}</td><td>{num(p.projection?.core_xfp)}</td><td>{num(p.projection?.x_bonus)}</td>
      <td>{num(p.projection?.p25,1)}</td><td>{num(p.projection?.p75,1)}</td><td>{num(p.projection?.p90,1)}</td><td>{pct(p.projection?.six_plus_probability)}</td><td>{num(p.projection?.expected_goals)}</td><td>{num(p.projection?.expected_assists)}</td><td>{num(p.projection?.value_score)}</td><td>{p.projection?.data_confidence||'—'}</td>
    </tr>)}</tbody></table></div>

    <div className="player-card-list">
      {rows.map((p,i)=><Link href={'/players/'+p.id} className="card mobile-player-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
        <div className="mobile-player-top">
          <div className="mobile-card-badges"><span className="weekly-rank">#{i+1}</span><span className={`pos ${p.position}`}>{posLabel(p.position)}</span></div>
          <div className="mobile-player-name"><b>{p.full_name}</b><span>{p.team} • {num(p.price,1)}m</span></div>
          <div className="mobile-xfp"><strong>{num(p.projection?.xfp)}</strong><small>xFP</small><em>{p.projection?.top25_rank?`Top25 #${p.projection.top25_rank}`:'Top25 —'}</em></div>
        </div>
        <div className="mobile-fixture"><span>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</span><b>Rakip: {p.projection?.opponent_name||'—'}</b>{playerNote(p)?<em>{playerNote(p)}</em>:null}</div>
        <div className="mobile-player-metrics">
          <div><span>İlk 11</span><b>{pct(p.projection?.xi_probability)}</b></div>
          <div><span>xDakika</span><b>{num(p.projection?.x_minutes,0)}</b></div>
          <div><span>6+ puan</span><b>{pct(p.projection?.six_plus_probability)}</b></div>
          <div><span>Tavan</span><b>{num(p.projection?.p90,1)}</b></div>
        </div>
      </Link>)}
    </div>
  </>
}
