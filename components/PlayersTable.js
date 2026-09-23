'use client'
import { useMemo, useState } from 'react'

export default function PlayersTable({ players }){
  const [q,setQ]=useState(''), [pos,setPos]=useState(''), [sort,setSort]=useState('xfp'), [dir,setDir]=useState(-1)
  const rows=useMemo(()=>{
    const out=players.filter(p=>(!pos||p.position===pos)&&(!q||(`${p.full_name} ${p.team}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))))
    const val=(p,k)=>k==='name'?p.full_name:k==='team'?p.team:k==='pos'?p.position:k==='price'?Number(p.price):k==='xi'?Number(p.projection.xi_probability||0):k==='minutes'?Number(p.projection.x_minutes||0):k==='p90'?Number(p.projection.p90||0):k==='six'?Number(p.projection.six_plus_probability||0):Number(p.projection.xfp||0)
    return [...out].sort((a,b)=>{const av=val(a,sort),bv=val(b,sort); return typeof av==='string'?dir*av.localeCompare(bv,'tr'):dir*(av-bv)})
  },[players,q,pos,sort,dir])
  const head=(k,label)=><th onClick={()=>{if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  return <>
    <div className="filters"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="">Tüm mevkiler</option><option>GK</option><option>DEF</option><option>MID</option><option>FWD</option></select></div>
    <div className="card table-wrap"><table><thead><tr>{head('name','Oyuncu')}{head('team','Takım')}{head('pos','Mevki')}{head('price','Fiyat')}{head('xi','İlk 11')}{head('minutes','xDk')}{head('xfp','xFP')}{head('p90','P90')}{head('six','6+ %')}<th>Güven</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><b>{p.full_name}</b></td><td>{p.team}</td><td><span className={`pos ${p.position}`}>{p.position}</span></td><td>{Number(p.price).toFixed(1)}m</td><td>{Math.round(Number(p.projection.xi_probability||0)*100)}%</td><td>{Number(p.projection.x_minutes||0).toFixed(1)}</td><td><b>{Number(p.projection.xfp||0).toFixed(2)}</b></td><td>{Number(p.projection.p90||0).toFixed(1)}</td><td>{(Number(p.projection.six_plus_probability||0)*100).toFixed(1)}%</td><td>{p.projection.data_confidence||'—'}</td></tr>)}</tbody></table></div>
    <p className="muted footnote">{rows.length} oyuncu gösteriliyor.</p>
  </>
}
