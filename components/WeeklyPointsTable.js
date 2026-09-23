'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function WeeklyPointsTable({ players, throughGameweek, finalThroughGameweek }){
  const [q,setQ]=useState('')
  const [team,setTeam]=useState('')
  const [sort,setSort]=useState('total')
  const [dir,setDir]=useState(-1)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const gameweeks=Array.from({length:throughGameweek},(_,i)=>i+1)

  const rows=useMemo(()=>{
    const out=players.filter(p=>
      (!team||p.team===team) &&
      (!q||((p.full_name+' '+p.team).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))))
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
      if(k.startsWith('gw'))return Number(p.pointMap.get(Number(k.slice(2)))?.points ?? -999)
      return p.total
    }

    return [...out].sort((a,b)=>{
      const av=value(a,sort),bv=value(b,sort)
      return typeof av==='string' ? dir*av.localeCompare(bv,'tr') : dir*(av-bv)
    })
  },[players,q,team,sort,dir])

  const head=(k,label)=><th onClick={()=>{if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const num=(v,d=2)=>Number(v||0).toFixed(d)

  return <>
    <div className="filters weekly-filters simplified-weekly-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
      </select>
      <select className="mobile-sort-select" value={sort} onChange={e=>{setSort(e.target.value);setDir(-1)}}>
        <option value="total">Toplam puan</option>
        <option value="avg">Maç ortalaması</option>
        <option value="played">Maç sayısı</option>
      </select>
    </div>

    <div className="table-summary weekly-summary">
      <span><b>{rows.length}</b> oyuncu</span>
      <span>Final: <b>GW{finalThroughGameweek||'—'}</b></span>
      {throughGameweek>finalThroughGameweek?<span className="live-week-note">GW{throughGameweek} açık • kapanınca puanlar otomatik dolacak</span>:null}
    </div>

    <div className="card table-wrap weekly-points-wrap simplified-weekly-table">
      <table>
        <thead><tr>
          <th className="rank-col">#</th>
          {head('name','Oyuncu')}
          {head('total','Toplam')}
          {head('played','Maç')}
          {head('avg','Ort.')}
          {gameweeks.map(g=>head('gw'+g,'GW'+g))}
        </tr></thead>
        <tbody>{rows.map((p,i)=><tr key={p.id}>
          <td className="rank-col">{i+1}</td>
          <td className="weekly-player-cell">
            <Link className="player-link" href={'/players/'+p.id}><b>{p.full_name}</b></Link>
            <small>{p.team}</small>
          </td>
          <td className="summary-score"><b>{p.total}</b></td>
          <td>{p.played}</td>
          <td>{num(p.avg)}</td>
          {gameweeks.map(g=>{
            const row=p.pointMap.get(g)
            const pending=g>finalThroughGameweek
            return <td key={g} className={pending?'weekly-score pending-score':row?'weekly-score':'weekly-score empty-score'}>
              {row?row.points:'—'}
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div>

    <div className="weekly-card-list">
      {rows.map((p,i)=><Link href={'/players/'+p.id} className="card weekly-mobile-card" key={p.id}>
        <div className="weekly-mobile-head">
          <span className="weekly-rank">#{i+1}</span>
          <div><b>{p.full_name}</b><small>{p.team}</small></div>
          <strong>{p.total}<small>toplam</small></strong>
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
            return <span className={pending?'pending':row&&Number(row.points)>=6?'hot':''} key={g}>
              <small>GW{g}</small><b>{row?row.points:'—'}</b>
            </span>
          })}
        </div>
      </Link>)}
    </div>
  </>
}
