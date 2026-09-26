'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { availabilityCompactNote, availabilityExpectedReturn, availabilityReason, availabilityStatusLabel } from '@/lib/availability'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

const formatCheck=(value)=>{
  if(!value)return '—'
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value))
  const get=t=>parts.find(x=>x.type===t)?.value||''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}

const formatDateOnly=value=>{
  if(!value)return '—'
  const d=new Date(value+'T12:00:00Z')
  return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)
}

export default function AvailabilityTable({ rows }){
  const [team,setTeam]=useState('')
  const [type,setType]=useState('')
  const [q,setQ]=useState('')

  const teams=useMemo(()=>[...new Set((rows||[]).map(r=>r.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[rows])
  const filtered=useMemo(()=>rows.filter(r=>
    (!team||r.team===team) &&
    (!type||r.availability_type===type) &&
    (!q||(`${r.player?.full_name||''} ${r.team||''} ${r.reason||''} ${r.source_reason||''} ${r.expected_return||''} ${r.suspension_fixture||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
  ),[rows,team,type,q])

  const injuryCount=(rows||[]).filter(r=>r.availability_type==='injuries').length
  const suspensionCount=(rows||[]).filter(r=>r.availability_type==='suspensions').length
  const returnCount=(rows||[]).filter(r=>r.availability_type==='return').length
  const detailedCount=(rows||[]).filter(r=>r.expected_return||r.suspension_fixture).length

  return <>
    <section className="availability-overview-grid">
      <div className="card"><span>Sakatlık</span><b>{injuryCount}</b><small>takip edilen oyuncu</small></div>
      <div className="card"><span>Ceza</span><b>{suspensionCount}</b><small>maç cezası kaydı</small></div>
      <div className="card"><span>Dönüş</span><b>{returnCount}</b><small>dönüş / yeniden kullanım</small></div>
      <div className="card"><span>Detaylı durum</span><b>{detailedCount}</b><small>dönüş / ceza bilgisi olan</small></div>
    </section>

    <div className="filters availability-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım, sakatlık veya dönüş ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>
        {teams.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="">Tüm durumlar</option>
        <option value="injuries">Sakatlık</option>
        <option value="suspensions">Ceza</option>
        <option value="return">Dönüş</option>
      </select>
    </div>

    <div className="table-summary availability-summary">
      <span><b>{filtered.length}</b> kayıt gösteriliyor</span>
      <span>Sakatlık tarihi, dönüş beklentisi ve ceza maçı bilgileri varsa ayrıca gösterilir.</span>
    </div>

    <div className="card table-wrap availability-table-wrap"><table className="availability-table-v2">
      <thead><tr>
        <th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th>
        <th>Not</th><th>Başlangıç</th><th>Dönüş / ceza maçı</th><th>Kontrol</th>
      </tr></thead>
      <tbody>{filtered.map((r,i)=>{
        const note=availabilityCompactNote(r)
        return <tr key={`${r.player_id}-${i}`}>
          <td>#{i+1}</td>
          <td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td>
          <td>{r.team}</td>
          <td><span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span></td>
          <td><span className={`status-chip ${r.availability_type||''}`}>{availabilityStatusLabel(r)}</span></td>
          <td>{(Number(r.availability_probability??1)*100).toFixed(0)}%</td>
          <td className="availability-note-cell"><b>{availabilityReason(r)||'—'}</b></td>
          <td>{formatDateOnly(r.injury_date)}</td>
          <td className="availability-return-cell">{r.suspension_fixture||availabilityExpectedReturn(r.expected_return)||'—'}</td>
          <td>{formatCheck(r.checked_at)}</td>
        </tr>
      })}</tbody>
    </table></div>

    <div className="availability-card-list">
      {filtered.map((r,i)=>{
        const note=availabilityCompactNote(r)
        return <Link href={'/players/'+r.player_id} className="card availability-mobile-card" key={'mobile-'+r.player_id+'-'+i}>
          <div className="availability-mobile-head">
            <span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span>
            <div><b>{r.player?.full_name||'—'}</b><small>{r.team||'—'}</small></div>
            <span className={`status-chip ${r.availability_type||''}`}>{availabilityStatusLabel(r)}</span>
          </div>
          <p>{note||'Detay yok'}</p>
          <div className="availability-mobile-meta">
            <span><small>Oynama</small><b>{(Number(r.availability_probability??1)*100).toFixed(0)}%</b></span>
            <span><small>Başlangıç</small><b>{formatDateOnly(r.injury_date)}</b></span>
            <span><small>Kontrol</small><b>{formatCheck(r.checked_at)}</b></span>
          </div>
        </Link>
      })}
    </div>
  </>
}
