'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { availabilityDateLabel, availabilityReturnLabel, availabilityReason, availabilityStatusLabel } from '@/lib/availability'
import {playerLabel} from '@/lib/playerPresentation'
import MultiSelectFilter from '@/components/MultiSelectFilter'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const fmtUpdate=value=>value?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(value)):'—'

export default function AvailabilityTable({ rows, freshnessAt=null }){
  const [team,setTeam]=useState([])
  const [type,setType]=useState([])
  const [q,setQ]=useState('')
  const [sort,setSort]=useState({key:null,dir:'asc'})

  const teams=useMemo(()=>[...new Set((rows||[]).map(r=>r.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[rows])
  const filtered=useMemo(()=>rows.filter(r=>
    (!team.length||team.includes(r.team)) &&
    (!type.length||type.some(t=>t==='risk' ? Number(r.availability_probability)>0&&Number(r.availability_probability)<1 : r.availability_type===t)) &&
    (!q||(`${r.player?.full_name||''} ${r.player?.short_label||''} ${r.team||''} ${r.canonical_reason||''} ${r.suspension_fixture||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
  ),[rows,team,type,q])

  // suspension_end is the END of a ban, not the date of the incident.
  const eventDate=r=>r.availability_type==='injuries'?r.injury_date:null
  const returnLabel=r=>r.availability_type==='suspensions'?(r.suspension_fixture||''):availabilityReturnLabel(r)
  const sortValue=(r,key)=>{
    if(key==='event')return String(eventDate(r)||'')
    if(r.availability_type==='suspensions'){
      const match=String(r.suspension_fixture||'').match(/^(\d{2})\.(\d{2})\.(\d{4})/)
      return match?`${match[3]}-${match[2]}-${match[1]}`:''
    }
    return String(r.expected_return_date||'')
  }
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
      <div className="card"><span>Ceza</span><b>{suspensionCount}</b><small>cezalı oyuncu</small></div>
      <div className="card"><span>Riskli</span><b>{riskCount}</b><small>oynama ihtimali düşmüş oyuncu</small></div>
      <div className="card availability-updated-card"><span>Son veri kontrolü</span><b>{latestCheckedAt?fmtUpdate(latestCheckedAt).split(' ')[1]:'—'}</b><small>{latestCheckedAt?fmtUpdate(latestCheckedAt).split(' ')[0]:'veri zamanı yok'}</small></div>
    </section>

    <div className="filters availability-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya sakatlık ara..."/>
      <MultiSelectFilter ariaLabel="Sakatlık ve ceza takım filtreleri" placeholder="Tüm takımlar" searchable
        value={team} onChange={setTeam} options={teams.map(t=>({value:t,label:t}))}/>
      <MultiSelectFilter ariaLabel="Sakatlık ve ceza durum filtreleri" placeholder="Tüm durumlar"
        value={type} onChange={setType} options={[
          {value:'injuries',label:'Sakatlık'},{value:'suspensions',label:'Ceza'},{value:'risk',label:'Riskli'}
        ]}/>
    </div>

    <div className="table-summary availability-summary">
      <span><b>{filtered.length}</b> kayıt gösteriliyor</span>
      <span>Yalnız güncel sakatlık, ceza ve oynama riski gösterilir.</span>
    </div>

    <div className="card table-wrap availability-table-wrap"><table className="availability-table-v2">
      <thead><tr>
        <th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th>
        <th>Detay</th><th><button type="button" style={{appearance:'none',border:0,background:'transparent',padding:0,margin:0,font:'inherit',fontWeight:'inherit',color:'inherit',textAlign:'left',cursor:'pointer'}} onClick={()=>toggleSort('event')}>Sakatlık tarihi{arrow('event')}</button></th><th><button type="button" style={{appearance:'none',border:0,background:'transparent',padding:0,margin:0,font:'inherit',fontWeight:'inherit',color:'inherit',textAlign:'left',cursor:'pointer'}} onClick={()=>toggleSort('return')}>Dönüş / kaçıracağı maç{arrow('return')}</button></th>
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
            <span><small>Oynama</small><b>{(Number(r.availability_probability??1)*100).toFixed(0)}%</b></span>
            {eventDate(r)?<span><small>Sakatlık tarihi</small><b>{availabilityDateLabel(eventDate(r))}</b></span>:null}
            {returnLabel(r)?<span><small>{r.availability_type==='suspensions'?'Kaçıracağı ilk maç':'Beklenen dönüş'}</small><b>{returnLabel(r)}</b></span>:null}
          </div>
        </Link>
      })}
    </div>
  </>
}
