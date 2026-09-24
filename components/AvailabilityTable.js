'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'

const labels={injuries:'Sakatlık',suspensions:'Ceza',return:'Dönüş',baseline:'Kontrol'}
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const formatCheck=(value)=>{
  if(!value)return '—'
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value))
  const get=t=>parts.find(x=>x.type===t)?.value||''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}

export default function AvailabilityTable({ rows }){
  const [team,setTeam]=useState('')
  const [type,setType]=useState('')
  const [q,setQ]=useState('')
  const teams=useMemo(()=>[...new Set((rows||[]).map(r=>r.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[rows])
  const filtered=useMemo(()=>rows.filter(r=>
    (!team||r.team===team) &&
    (!type||r.availability_type===type) &&
    (!q||(`${r.player?.full_name||''} ${r.team||''} ${r.reason||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
  ),[rows,team,type,q])

  return <>
    <div className="filters availability-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya neden ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>
        {teams.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="">Tüm durumlar</option>
        <option value="injuries">Sakatlık</option>
        <option value="suspensions">Ceza</option>
      </select>
    </div>
    <div className="table-summary"><b>{filtered.length}</b> kayıt gösteriliyor</div>
    <div className="card table-wrap"><table><thead><tr><th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th><th>Neden</th><th>Kontrol</th></tr></thead>
      <tbody>{filtered.map((r,i)=><tr key={`${r.player_id}-${i}`}><td>#{i+1}</td><td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td><td>{r.team}</td><td><span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span></td><td><span className="status-chip">{labels[r.availability_type]||r.availability_type}</span></td><td>{(Number(r.availability_probability||0)*100).toFixed(0)}%</td><td>{r.reason||'—'}</td><td>{formatCheck(r.checked_at)}</td></tr>)}</tbody>
    </table></div>
  </>
}
