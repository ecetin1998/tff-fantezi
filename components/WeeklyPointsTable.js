'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function WeeklyPointsTable({ players, throughGameweek }){
  const [q,setQ]=useState('')
  const [team,setTeam]=useState('')
  const [pos,setPos]=useState('')
  const [sort,setSort]=useState('total')
  const [dir,setDir]=useState(-1)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const gameweeks=Array.from({length:throughGameweek},(_,i)=>i+1)

  const rows=useMemo(()=>{
    const out=players.filter(p=>
      (!team||p.team===team) &&
      (!pos||p.position===pos) &&
      (!q||((p.full_name+' '+p.team).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))))
    ).map(p=>{
      const map=new Map((p.weekly||[]).map(x=>[Number(x.gameweek),x]))
      const stats=p.stats||{}
      const played=Number(stats.matches_played||0)
      const total=Number(stats.actual_points||0)
      return {
        ...p,
        pointMap:map,
        total,
        avg:played?total/played:0,
        six:played?Number(stats.six_plus_count||0)/played:0,
        played,
      }
    })

    const value=(p,k)=>{
      if(k==='name') return p.full_name
      if(k==='team') return p.team
      if(k==='pos') return p.position
      if(k==='price') return Number(p.price||0)
      if(k==='total') return p.total
      if(k==='avg') return p.avg
      if(k==='six') return p.six
      if(k==='played') return p.played
      if(k.startsWith('gw')) return Number(p.pointMap.get(Number(k.slice(2)))?.points ?? -999)
      return p.total
    }

    return [...out].sort((a,b)=>{
      const av=value(a,sort),bv=value(b,sort)
      return typeof av==='string' ? dir*av.localeCompare(bv,'tr') : dir*(av-bv)
    })
  },[players,q,team,pos,sort,dir])

  const head=(k,label)=><th onClick={()=>{if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const num=(v,d=1)=>Number(v||0).toFixed(d)
  const pct=v=>(Number(v||0)*100).toFixed(0)+'%'

  return <>
    <div className="filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}><option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}</select>
      <select value={pos} onChange={e=>setPos(e.target.value)}><option value="">Tüm mevkiler</option><option>GK</option><option>DEF</option><option>MID</option><option>FWD</option></select>
    </div>
    <div className="table-summary"><b>{rows.length}</b> oyuncu • ortalama ve 6+ oranı yalnız oynadığı maçlara göre</div>
    <div className="card table-wrap weekly-points-wrap"><table><thead><tr>
      <th className="rank-col">#</th>
      {head('name','Oyuncu')}
      {head('team','Takım')}
      {head('pos','Mevki')}
      {head('price','Fiyat')}
      {head('total','Toplam')}
      {head('played','Maç')}
      {head('avg','Ort.')}
      {head('six','6+ %')}
      {gameweeks.map(g=>head('gw'+g,'GW'+g))}
    </tr></thead><tbody>
      {rows.map((p,i)=><tr key={p.id}>
        <td className="rank-col">{i+1}</td>
        <td><Link className="player-link" href={'/players/'+p.id}><b>{p.full_name}</b></Link></td>
        <td>{p.team}</td>
        <td><span className={['pos',p.position].join(' ')}>{p.position}</span></td>
        <td>{num(p.price)}m</td>
        <td><b>{p.total}</b></td>
        <td>{p.played}</td>
        <td>{num(p.avg,2)}</td>
        <td>{pct(p.six)}</td>
        {gameweeks.map(g=>{
          const row=p.pointMap.get(g)
          return <td key={g} className={row?'weekly-score':'weekly-score empty-score'}>{row?row.points:'—'}</td>
        })}
      </tr>)}
    </tbody></table></div>
  </>
}
