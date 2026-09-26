'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { teamCssVars } from '@/lib/teamThemes'
import { availabilityCompactNote, availabilityIsIssue } from '@/lib/availability'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const PAGE_SIZE=100
const normalizeText=value=>String(value||'')
  .toLocaleLowerCase('tr')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/ı/g,'i')

export default function PlayersTable({players,initialFilters={}}){
  const [q,setQ]=useState(initialFilters.q||'')
  const [pos,setPos]=useState(initialFilters.pos||'')
  const [team,setTeam]=useState(initialFilters.team||'')
  const [sort,setSort]=useState(initialFilters.sort||'xfp')
  const [dir,setDir]=useState(initialFilters.dir==='asc'?1:-1)
  const [page,setPage]=useState(Math.max(1,Number(initialFilters.page||1)))
  const [isMobile,setIsMobile]=useState(false)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])

  useEffect(()=>{
    const mq=window.matchMedia('(max-width: 760px)')
    const sync=()=>setIsMobile(mq.matches)
    sync()
    mq.addEventListener?.('change',sync)
    return()=>mq.removeEventListener?.('change',sync)
  },[])

  const rows=useMemo(()=>{
    const needle=normalizeText(q.trim())
    const out=players.filter(p=>
      (!pos||p.position===pos) &&
      (!team||p.team===team) &&
      (!needle||normalizeText((p.full_name||'')+' '+(p.display_name||'')+' '+p.team+' '+(p.projection?.opponent_name||'')).includes(needle))
    )
    const val=(p,k)=>{
      if(k==='name')return p.full_name
      if(k==='team')return p.team
      if(k==='pos')return p.position
      if(k==='opp')return p.projection?.opponent_name||''
      if(k==='price')return Number(p.price)
      if(k==='points')return Number(p.total_points||0)
      if(k==='xi')return Number(p.projection?.xi_probability||0)
      if(k==='minutes')return Number(p.projection?.x_minutes||0)
      if(k==='p25')return Number(p.projection?.p25||0)
      if(k==='p90')return Number(p.projection?.p90||0)
      if(k==='six')return Number(p.projection?.six_plus_probability||0)
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

  const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE))
  const safePage=Math.min(page,pageCount)
  const pageRows=rows.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE)

  useEffect(()=>{if(page>pageCount)setPage(pageCount)},[page,pageCount])
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const put=(key,value,defaultValue='')=>value&&value!==defaultValue?params.set(key,String(value)):params.delete(key)
    put('q',q);put('team',team);put('pos',pos);put('sort',sort,'xfp')
    put('dir',dir===1?'asc':'desc','desc');put('page',safePage,1)
    const next=params.toString()
    window.history.replaceState(null,'',window.location.pathname+(next?'?'+next:''))
  },[q,team,pos,sort,dir,safePage])

  const change=setter=>e=>{setter(e.target.value);setPage(1)}
  const head=(k,label)=><th onClick={()=>{setPage(1);if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const pct=v=>String((Number(v||0)*100).toFixed(0))+'%'
  const num=(v,d=2)=>Number(v||0).toFixed(d)
  const playerNote=p=>{
    const a=p.availability
    if(!a)return ''
    const visible=availabilityIsIssue(a)||a.availability_type==='return'||a.expected_return||a.suspension_fixture
    return visible?availabilityCompactNote(a):''
  }
  const openRow=(e,id)=>{
    if(e.target.closest('a,button,input,select'))return
    window.location.href='/players/'+id
  }

  return <>
    <div className="filters player-filters">
      <input value={q} onChange={change(setQ)} placeholder="Oyuncu, takım veya rakip ara..." aria-label="Oyuncu ara"/>
      <select value={team} onChange={change(setTeam)}>
        <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={pos} onChange={change(setPos)}>
        <option value="">Tüm mevkiler</option><option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
      </select>
      <select className="mobile-sort-select" value={sort} onChange={e=>{setSort(e.target.value);setDir(-1);setPage(1)}}>
        <option value="xfp">xFP'ye göre</option><option value="xi">İlk 11 ihtimaline göre</option><option value="minutes">Dakikaya göre</option><option value="p90">P90'a göre</option><option value="six">6+ ihtimaline göre</option><option value="points">Toplam puana göre</option><option value="value">F/P'ye göre</option><option value="price">Fiyata göre</option>
      </select>
    </div>

    <div className="table-summary"><b>{rows.length}</b> oyuncu • satıra veya karta dokunarak detaya git</div>
    <div className="projection-legend">Karar metrikleri: <b>İlk 11</b> + <b>xDakika</b> oynama ihtimalini, <b>xFP</b> ortalama beklentiyi, <b>P25/P90</b> ise dağılım eşiklerini gösterir.</div>

    {!rows.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen oyuncu bulunamadı.</div>:isMobile?
      <div className="player-card-list">
        {pageRows.map((p,i)=><Link href={'/players/'+p.id} className="card mobile-player-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
          <div className="mobile-player-top">
            <div className="mobile-card-badges"><span className="weekly-rank">#{(safePage-1)*PAGE_SIZE+i+1}</span><span className={'pos '+p.position}>{posLabel(p.position)}</span></div>
            <div className="mobile-player-name"><b>{p.full_name}</b><span>{p.team} • {num(p.price,1)}m</span></div>
            <div className="mobile-xfp"><strong>{num(p.projection?.xfp)}</strong><small>xFP</small><em>{num(p.total_points,0)} toplam puan</em></div>
          </div>
          <div className="mobile-fixture"><span>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</span><b>Rakip: {p.projection?.opponent_name||'—'}</b>{playerNote(p)?<em>{playerNote(p)}</em>:null}</div>
          <div className="mobile-player-metrics">
            <div><span>İlk 11</span><b>{pct(p.projection?.xi_probability)}</b></div>
            <div><span>xDakika</span><b>{num(p.projection?.x_minutes,0)}</b></div>
            <div><span>6+ puan</span><b>{pct(p.projection?.six_plus_probability)}</b></div>
            <div><span>P90</span><b>{num(p.projection?.p90,1)}</b></div>
          </div>
        </Link>)}
      </div>
      :
      <div className="card table-wrap desktop-player-table"><table><thead><tr>
        <th className="rank-col">#</th>{head('name','Oyuncu')}{head('team','Takım')}{head('pos','Mevki')}{head('opp','Rakip')}<th>E/D</th>
        {head('price','Fiyat')}{head('points','Toplam Puan')}{head('xi','İlk 11')}{head('minutes','xDk')}{head('xfp','xFP')}
        {head('p25','P25')}{head('p90','P90')}{head('six','6+ %')}{head('xg','xG')}{head('xa','xA')}{head('value','F/P')}
      </tr></thead><tbody>{pageRows.map((p,i)=><tr className="team-player-row clickable-row" style={teamCssVars(p.team)} key={p.id}
        tabIndex={0} onClick={e=>openRow(e,p.id)} onKeyDown={e=>{if(e.key==='Enter')window.location.href='/players/'+p.id}}>
        <td className="rank-col">#{(safePage-1)*PAGE_SIZE+i+1}</td>
        <td><Link className="player-link team-player-link" href={'/players/'+p.id}><i className="club-dot"/><b>{p.full_name}</b></Link>{playerNote(p)?<small className="cell-note">{playerNote(p)}</small>:null}</td>
        <td><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></td><td><span className={'pos '+p.position}>{posLabel(p.position)}</span></td><td>{p.projection?.opponent_name||'—'}</td><td>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</td>
        <td>{num(p.price,1)}m</td><td><b>{num(p.total_points,0)}</b></td><td>{pct(p.projection?.xi_probability)}</td><td>{num(p.projection?.x_minutes,0)}</td><td><b>{num(p.projection?.xfp)}</b></td>
        <td>{num(p.projection?.p25,1)}</td><td>{num(p.projection?.p90,1)}</td><td>{pct(p.projection?.six_plus_probability)}</td><td>{num(p.projection?.expected_goals)}</td><td>{num(p.projection?.expected_assists)}</td><td>{num(p.projection?.value_score)}</td>
      </tr>)}</tbody></table></div>
    }

    {rows.length>PAGE_SIZE?<div className="pagination-bar">
      <button type="button" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Önceki</button>
      <span>Sayfa <b>{safePage}</b> / {pageCount}</span>
      <button type="button" disabled={safePage>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Sonraki →</button>
    </div>:null}
  </>
}
