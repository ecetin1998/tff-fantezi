'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { availabilityCompactNote } from '@/lib/availability'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const normalizeText=value=>String(value||'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i')
const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)

export default function TeamRoster({players=[]}){
  const [q,setQ]=useState('')
  const [pos,setPos]=useState('')

  const rows=useMemo(()=>{
    const needle=normalizeText(q.trim())
    return players.filter(p=>{
      const matchesPos=!pos||p.position===pos
      const haystack=normalizeText(`${p.full_name||''} ${p.display_name||''} ${posLabel(p.position)} ${p.position||''}`)
      return matchesPos&&(!needle||haystack.includes(needle))
    })
  },[players,q,pos])

  return <>
    <div className="team-roster-tools">
      <input
        value={q}
        onChange={e=>setQ(e.target.value)}
        placeholder="Oyuncu ara..."
        aria-label="Takım oyuncularında ara"
      />
      <select value={pos} onChange={e=>setPos(e.target.value)} aria-label="Mevkiye göre filtrele">
        <option value="">Tüm mevkiler</option>
        <option value="GK">KL</option>
        <option value="DEF">DEF</option>
        <option value="MID">OS</option>
        <option value="FWD">FOR</option>
      </select>
      <span className="team-roster-filter-count"><b>{rows.length}</b> / {players.length}</span>
    </div>

    <div className="team-roster-column-head team-roster-column-head-v3">
      <span>Oyuncu</span><span>Fiyat</span><span>İlk 11</span><span>xDk</span><span>xFP</span>
    </div>

    <div className="team-roster-grid team-roster-grid-v3">
      {rows.map(p=>{
        const note=availabilityCompactNote(p.availability)
        return <Link href={'/players/'+p.id} className="team-roster-player team-roster-player-v3" key={p.id}>
          <div className="team-roster-identity">
            <span className={'pos '+p.position}>{posLabel(p.position)}</span>
            <div className="team-roster-copy">
              <b>{p.full_name}</b>
              {note?<small><span className="team-roster-alert">{note}</span></small>:null}
            </div>
          </div>
          <div className="team-roster-metrics-v3">
            <div className="team-roster-metric price"><span>Fiyat</span><b>{Number(p.price||0).toFixed(1)}m</b></div>
            <div className="team-roster-metric"><span>İlk 11</span><b>{pct(p.projection?.xi_probability)}</b></div>
            <div className="team-roster-metric"><span>xDk</span><b>{num(p.projection?.x_minutes,0)}</b></div>
            <div className="team-roster-metric xfp"><span>xFP</span><b>{num(p.projection?.xfp)}</b></div>
          </div>
        </Link>
      })}
      {!rows.length?<div className="team-roster-empty">Bu filtrelerle eşleşen oyuncu yok.</div>:null}
    </div>
  </>
}
