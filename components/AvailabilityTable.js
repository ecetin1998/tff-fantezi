'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { availabilityDateLabel, availabilityReturnLabel, availabilityReason, availabilityStatusLabel } from '@/lib/availability'
import {playerLabel} from '@/lib/playerPresentation'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const fmtUpdate=value=>value?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(value)):'—'

export default function AvailabilityTable({ rows, freshnessAt=null }){
  const [team,setTeam]=useState('')
  const [type,setType]=useState('')
  const [q,setQ]=useState('')
  const [sort,setSort]=useState({key:null,dir:'asc'})

  const teams=useMemo(()=>[...new Set((rows||[]).map(r=>r.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[rows])
  const filtered=useMemo(()=>rows.filter(r=>
    (!team||r.team===team) &&
    (!type||(type==='risk' ? Number(r.availability_probability)>0&&Number(r.availability_probability)<1 : r.availability_type===type)) &&
    (!q||(`${r.player?.full_name||''} ${r.player?.short_label||''} ${r.team||''} ${r.canonical_reason||''} ${r.suspension_fixture||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
  ),[rows,team,type,q])

  const eventDate=r=>r.availability_type==='suspensions'?r.suspension_end:r.injury_date
  const returnLabel=r=>r.availability_type==='suspensions'?(r.suspension_fixture||''):availabilityReturnLabel(r)
  const sortValue=(r,key)=>key==='event'?String(eventDate(r)||''):String(r.expected_return_date||r.suspension_end||'')
  if(sort.key)filtered.sort((a,b)=>{const av=sortValue(a,sort.key),bv=sortValue(b,sort.key); if(!av)return 1;if(!bv)return -1;const n=av.localeCompare(bv);return sort.dir==='asc'?n:-n})
  const toggleSort=key=>setSort(s=>s.key===key?{key,dir:s.dir==='asc'?'desc':'asc'}:{key,dir:'asc'})
  const arrow=key=>sort.key===key?(sort.dir==='asc'?' ↑':' ↓'):' ↕'

  const injuryCount=(rows||[]).filter(r=>r.availability_type==='injuries').length
  const suspensionCount=(rows||[]).filter(r=>r.availability_type==='suspensions').length
  const riskCount=(rows||[]).filter(r=>Number(r.availability_probability)>0&&Number(r.availability_probability)<1).length
  const latestCheckedAt=freshnessAt||(rows||[]).map(r=>r.checked_at).filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0]||null

  return <>
    <section className="availability-overview-grid">
      <div className="card"><span>Sakatlık</span><b>{injuryCount}</b><small>takip edilen oyuncu</small></div>
      <div className="card"><span>Ceza</span><b>{suspensionCount}</b><small>maç cezası kaydı</small></div>
      <div className="card"><span>Riskli</span><b>{riskCount}</b><small>oynama ihtimali düşmüş oyuncu</small></div>
      <div className="card availability-updated-card"><span>Son veri kontrolü</span><b>{latestCheckedAt?fmtUpdate(latestCheckedAt).split(' ')[1]:'—'}</b><small>{latestCheckedAt?fmtUpdate(latestCheckedAt).split(' ')[0]:'veri zamanı yok'}</small></div>
    </section>

    <div className="filters availability-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya sakatlık ara..."/>
      <select value={team} onChange={e=>setTeam(e.target.value)}>
        <option value="">Tüm takımlar</option>
        {teams.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="">Tüm durumlar</option>
        <option value="injuries">Sakatlık</option>
        <option value="suspensions">Ceza</option>
        <option value="risk">Riskli</option>
      </select>
    </div>

    <div className="table-summary availability-summary">
      <span><b>{filtered.length}</b> kayıt gösteriliyor</span>
      <span>Yalnız güncel sakatlık, ceza ve oynama riski gösterilir.</span>
    </div>

    <div className="card table-wrap availability-table-wrap"><table className="availability-table-v2">
      <thead><tr>
        <th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th>
        <th>Detay</th><th><button type="button" className="table-sort-button" onClick={()=>toggleSort('event')}>Sakatlık / ceza zamanı{arrow('event')}</button></th><th><button type="button" className="table-sort-button" onClick={()=>toggleSort('return')}>Beklenen dönüş{arrow('return')}</button></th>
      </tr></thead>
      <tbody>{filtered.map((r,i)=>{
        return <tr key={`${r.player_id}-${i}`}>
          <td>#{i+1}</td>
          <td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{playerLabel(r.player)}</b></Link>:'—'}</td>
          <td>{r.team}</td>
          <td><span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span></td>
          <td><span className={`status-chip ${r.availability_type||''}`}>{availabilityStatusLabel(r)}</span></td>
          <td>{(Number(r.availability_probability??1)*100).toFixed(0)}%</td>
          <td className="availability-note-cell"><b>{availabilityReason(r)||'—'}</b></td><td>{availabilityDateLabel(eventDate(r))||'—'}</td><td>{returnLabel(r)||'—'}</td>
        </tr>
      })}</tbody>
    </table></div>

    <div className="availability-card-list">
      {filtered.map((r,i)=>{
        const note=availabilityReason(r)
        return <Link href={'/players/'+r.player_id} className="card availability-mobile-card" key={'mobile-'+r.player_id+'-'+i}>
          <div className="availability-mobile-head">
            <span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span>
            <div className="availability-mobile-player"><b>{playerLabel(r.player)}</b><small>{r.team||'—'}</small></div>
            <span className={`status-chip ${r.availability_type||''}`}>{availabilityStatusLabel(r)}</span>
          </div>
          <p>{note||'Detay yok'}</p>
          <div className="availability-mobile-meta">
            <span><small>Oynama</small><b>{(Number(r.availability_probability??1)*100).toFixed(0)}%</b></span><span><small>Sakatlık / ceza</small><b>{availabilityDateLabel(eventDate(r))||'—'}</b></span><span><small>Beklenen dönüş</small><b>{returnLabel(r)||'—'}</b></span>
          </div>
        </Link>
      })}
    </div>
  </>
}
