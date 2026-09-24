'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { teamCssVars } from '@/lib/teamThemes'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

export default function WeeklyPointsTable({ players, throughGameweek, finalThroughGameweek }){
  const [q,setQ]=useState('')
  const [team,setTeam]=useState('')
  const [pos,setPos]=useState('')
  const [sort,setSort]=useState('total')
  const [weekSort,setWeekSort]=useState(()=>Math.max(1,Number(finalThroughGameweek||1)))
  const [dir,setDir]=useState(-1)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const gameweeks=Array.from({length:throughGameweek},(_,i)=>i+1)

  const rows=useMemo(()=>{
    const out=players.filter(p=>
      (!team||p.team===team) &&
      (!pos||p.position===pos) &&
      (!q||(((p.full_name||'')+' '+(p.display_name||'')+' '+p.team).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))))
    ).map(p=>{
      const map=new Map((p.weekly||[]).map(x=>[Number(x.gameweek),x]))
      const stats=p.stats||{}
      const played=Number(stats.matches_played||0)
      const total=Number(stats.actual_points||0)
      return {...p,pointMap:map,total,avg:played?total/played:0,played}
    })

    const value=(p,k)=>{
      if(k==='name')return p.full_name
      if(k==='total')return p.total
      if(k==='avg')return p.avg
      if(k==='played')return p.played
      if(k==='week')return Number(p.pointMap.get(Number(weekSort))?.points ?? -999)
      if(k.startsWith('gw'))return Number(p.pointMap.get(Number(k.slice(2)))?.points ?? -999)
      return p.total
    }

    return [...out].sort((a,b)=>{
      const av=value(a,sort),bv=value(b,sort)
      return typeof av==='string' ? dir*av.localeCompare(bv,'tr') : dir*(av-bv)
    })
  },[players,q,team,pos,sort,weekSort,dir])

  const head=(k,label,className='')=><th className={className} onClick={()=>{if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const num=(v,d=2)=>Number(v||0).toFixed(d)
  const weekMode=sort==='week'

  return <>
    <div className="filters weekly-filters simplified-weekly-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={pos} onChange={e=>setPos(e.target.value)}>
        <option value="">Tüm mevkiler</option>
        <option value="GK">KL</option>
        <option value="DEF">DEF</option>
        <option value="MID">OS</option>
        <option value="FWD">FOR</option>
      </select>
      <select className="weekly-sort-select" value={sort} onChange={e=>{setSort(e.target.value);setDir(-1)}}>
        <option value="total">Toplam puan</option>
        <option value="avg">Maç ortalaması</option>
        <option value="played">Maç sayısı</option>
        <option value="week">Hafta puanı</option>
      </select>
      {sort==='week'?<select className="weekly-week-filter" value={weekSort} onChange={e=>{setWeekSort(Number(e.target.value));setDir(-1)}}>
        {gameweeks.filter(g=>g<=finalThroughGameweek).map(g=>
          <option key={g} value={g}>MH{g}</option>
        )}
      </select>:null}
    </div>

    <div className="table-summary weekly-summary">
      <span><b>{rows.length}</b> oyuncu</span>
      <span>Final: <b>MH{finalThroughGameweek||'—'}</b></span>
      {weekMode?<span className="selected-week-summary"><b>MH{weekSort}</b> seçili</span>:null}
      {throughGameweek>finalThroughGameweek?<span className="live-week-note">MH{throughGameweek} açık • kapanınca puanlar otomatik dolacak</span>:null}
    </div>

    <div className="card table-wrap weekly-points-wrap simplified-weekly-table">
      <table>
        <thead><tr>
          <th className="rank-col">#</th>
          {head('name','Oyuncu')}
          {head('total','Toplam')}
          {head('played','Maç')}
          {head('avg','Ort.')}
          {gameweeks.map(g=>head('gw'+g,'MH'+g,weekMode&&g===weekSort?'selected-week-col':''))}
        </tr></thead>
        <tbody>{rows.map((p,i)=><tr className="team-player-row" style={teamCssVars(p.team)} key={p.id}>
          <td className="rank-col">#{i+1}</td>
          <td className="weekly-player-cell">
            <Link className="player-link" href={'/players/'+p.id}><b>{p.full_name}</b></Link>
            <small><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></small>
          </td>
          <td className="summary-score"><b>{p.total}</b></td>
          <td>{p.played}</td>
          <td>{num(p.avg)}</td>
          {gameweeks.map(g=>{
            const row=p.pointMap.get(g)
            const pending=g>finalThroughGameweek
            const selected=weekMode&&g===weekSort
            const stateClass=pending?'pending-score':row?'':'empty-score'
            return <td key={g} className={`weekly-score ${stateClass} ${selected?'selected-week-cell':''}`.trim()}>
              {row?row.points:'—'}
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div>

    <div className="weekly-card-list">
      {rows.map((p,i)=><Link href={'/players/'+p.id} className="card weekly-mobile-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
        <div className="weekly-mobile-head">
          <div className="mobile-card-badges"><span className="weekly-rank">#{i+1}</span><span className={`pos ${p.position}`}>{posLabel(p.position)}</span></div>
          <div className="weekly-mobile-player-name"><b>{p.full_name}</b><small>{p.team}</small></div>
          <div className={weekMode?'weekly-total-score selected-week-score':'weekly-total-score'}>
            <strong>{weekMode?(p.pointMap.get(Number(weekSort))?.points ?? '—'):p.total}</strong>
            <small>{weekMode?`MH${weekSort}`:'puan'}</small>
          </div>
        </div>

        <div className="weekly-mobile-meta compact">
          <span><small>Maç</small><b>{p.played}</b></span>
          <span><small>Ortalama</small><b>{num(p.avg)}</b></span>
        </div>

        <div className="week-scroll-head"><b>Hafta hafta</b><span>kaydır →</span></div>
        <div className="week-chip-row scroll-snap-weeks">
          {gameweeks.map(g=>{
            const row=p.pointMap.get(g)
            const pending=g>finalThroughGameweek
            const classes=[
              pending?'pending':'',
              row&&Number(row.points)>=6?'hot':'',
              weekMode&&g===weekSort?'selected':''
            ].filter(Boolean).join(' ')
            return <span className={classes} key={g}>
              <small>MH{g}</small><b>{row?row.points:'—'}</b>
            </span>
          })}
        </div>
      </Link>)}
    </div>
  </>
}
