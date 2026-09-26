'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { teamCssVars } from '@/lib/teamThemes'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const PAGE_SIZE=100
const normalizeText=value=>String(value||'')
  .toLocaleLowerCase('tr')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/ı/g,'i')

export default function WeeklyPointsTable({players,throughGameweek,finalThroughGameweek,initialFilters={}}){
  const [q,setQ]=useState(initialFilters.q||'')
  const [team,setTeam]=useState(initialFilters.team||'')
  const [pos,setPos]=useState(initialFilters.pos||'')
  const [sort,setSort]=useState(initialFilters.sort||'total')
  const [weekSort,setWeekSort]=useState(()=>Math.max(1,Number(initialFilters.week||finalThroughGameweek||1)))
  const [dir,setDir]=useState(initialFilters.dir==='asc'?1:-1)
  const [page,setPage]=useState(Math.max(1,Number(initialFilters.page||1)))
  const [isMobile,setIsMobile]=useState(false)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const gameweeks=Array.from({length:throughGameweek},(_,i)=>i+1)

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
      (!team||p.team===team) &&
      (!pos||p.position===pos) &&
      (!needle||normalizeText((p.full_name||'')+' '+(p.display_name||'')+' '+p.team).includes(needle))
    ).map(p=>{
      const finalRows=(p.weekly||[]).filter(x=>x.is_final!==false)
      const map=new Map(finalRows.map(x=>[Number(x.gameweek),x]))
      const playedWeeks=finalRows.filter(x=>Number(x.minutes||0)>0)
      const total=Number(p.stats?.actual_points ?? finalRows.reduce((sum,x)=>sum+Number(x.points||0),0))
      const played=Number(p.stats?.matches_played ?? playedWeeks.length)
      const avg=played?total/played:0
      const sixPlus=played?Number(p.stats?.six_plus_count ?? playedWeeks.filter(x=>Number(x.points||0)>=6).length)/played:0
      const recentPlayed=playedWeeks.slice(-3)
      const last3=recentPlayed.length?recentPlayed.reduce((sum,x)=>sum+Number(x.points||0),0)/recentPlayed.length:0
      const trend=played&&recentPlayed.length?last3-avg:0
      return {...p,pointMap:map,total,avg,played,sixPlus,last3,trend}
    })

    const value=(p,k)=>{
      if(k==='name')return p.full_name
      if(k==='total')return p.total
      if(k==='avg')return p.avg
      if(k==='played')return p.played
      if(k==='last3')return p.last3
      if(k==='six')return p.sixPlus
      if(k==='week')return Number(p.pointMap.get(Number(weekSort))?.points ?? -999)
      if(k.startsWith('gw'))return Number(p.pointMap.get(Number(k.slice(2)))?.points ?? -999)
      return p.total
    }
    return [...out].sort((a,b)=>{
      const av=value(a,sort),bv=value(b,sort)
      return typeof av==='string'?dir*av.localeCompare(bv,'tr'):dir*(av-bv)
    })
  },[players,q,team,pos,sort,weekSort,dir])

  const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE))
  const safePage=Math.min(page,pageCount)
  const pageRows=rows.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE)
  useEffect(()=>{if(page>pageCount)setPage(pageCount)},[page,pageCount])
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const put=(key,value,defaultValue='')=>value&&value!==defaultValue?params.set(key,String(value)):params.delete(key)
    put('q',q);put('team',team);put('pos',pos);put('sort',sort,'total')
    put('week',sort==='week'?weekSort:'','');put('dir',dir===1?'asc':'desc','desc');put('page',safePage,1)
    const next=params.toString()
    window.history.replaceState(null,'',window.location.pathname+(next?'?'+next:''))
  },[q,team,pos,sort,weekSort,dir,safePage])

  const change=setter=>e=>{setter(e.target.value);setPage(1)}
  const head=(k,label,className='')=><th className={className} onClick={()=>{setPage(1);if(sort===k)setDir(-dir);else{setSort(k);setDir(-1)}}}>{label}{sort===k?<span className="sortmark">{dir===-1?' ↓':' ↑'}</span>:null}</th>
  const num=(v,d=2)=>Number(v||0).toFixed(d)
  const weekMode=sort==='week'
  const openRow=(e,id)=>{if(e.target.closest('a,button,input,select'))return;window.location.href='/players/'+id}

  return <>
    <div className="filters weekly-filters simplified-weekly-filters">
      <input value={q} onChange={change(setQ)} placeholder="Oyuncu veya takım ara..." aria-label="Oyuncu ara"/>
      <select value={team} onChange={change(setTeam)}>
        <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={pos} onChange={change(setPos)}>
        <option value="">Tüm mevkiler</option><option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
      </select>
      <select className="weekly-sort-select" value={sort} onChange={e=>{setSort(e.target.value);setDir(-1);setPage(1)}}>
        <option value="total">Toplam puan</option><option value="avg">Maç ortalaması</option><option value="last3">Son 3 ortalaması</option><option value="six">6+ yüzdesi</option><option value="played">Oynanan maç</option><option value="week">Hafta puanı</option>
      </select>
      {sort==='week'?<select className="weekly-week-filter" value={weekSort} onChange={e=>{setWeekSort(Number(e.target.value));setDir(-1);setPage(1)}}>
        {gameweeks.filter(g=>g<=finalThroughGameweek).map(g=><option key={g} value={g}>MH{g}</option>)}
      </select>:null}
    </div>

    <div className="table-summary weekly-summary">
      <span><b>{rows.length}</b> oyuncu</span>
      <span>Kesinleşen: <b>MH{finalThroughGameweek||'—'}</b></span>
      {weekMode?<span className="selected-week-summary"><b>MH{weekSort}</b> seçili</span>:null}
      {throughGameweek>finalThroughGameweek?<span className="live-week-note">MH{throughGameweek} açık • kapanınca puanlar otomatik dolacak</span>:null}
    </div>

    {!rows.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen oyuncu bulunamadı.</div>:isMobile?
      <div className="weekly-card-list">
        {pageRows.map((p,i)=><Link href={'/players/'+p.id} className="card weekly-mobile-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
          <div className="weekly-mobile-head">
            <div className="mobile-card-badges"><span className="weekly-rank">#{(safePage-1)*PAGE_SIZE+i+1}</span><span className={'pos '+p.position}>{posLabel(p.position)}</span></div>
            <div className="weekly-mobile-player-name"><b>{p.full_name}</b><small>{p.team}</small></div>
            <div className={weekMode?'weekly-total-score selected-week-score':'weekly-total-score'}>
              <strong>{weekMode?(p.pointMap.get(Number(weekSort))?.points ?? '—'):p.total}</strong><small>{weekMode?'MH'+weekSort:'puan'}</small>
            </div>
          </div>
          <div className="weekly-mobile-meta compact weekly-form-meta">
            <span><small>Maç</small><b>{p.played}</b></span><span><small>Ortalama</small><b>{num(p.avg)}</b></span><span><small>Son 3</small><b>{num(p.last3)}</b></span><span><small>6+ %</small><b>{(p.sixPlus*100).toFixed(0)}%</b></span>
            <span className={'mobile-form-trend '+(p.trend>.5?'up':p.trend<-.5?'down':'flat')}><small>Form</small><b>{p.trend>.5?'↑':p.trend<-.5?'↓':'→'}</b></span>
          </div>
          <div className="week-scroll-head"><b>Hafta hafta</b><span>kaydır →</span></div>
          <div className="week-chip-row scroll-snap-weeks">
            {gameweeks.map(g=>{const row=p.pointMap.get(g),pending=g>finalThroughGameweek;const classes=[pending?'pending':'',row&&Number(row.points)>=6?'hot':'',weekMode&&g===weekSort?'selected':''].filter(Boolean).join(' ');return <span className={classes} key={g}><small>MH{g}</small><b>{row?row.points:'—'}</b></span>})}
          </div>
        </Link>)}
      </div>
      :
      <div className="card table-wrap weekly-points-wrap simplified-weekly-table"><table>
        <thead><tr><th className="rank-col">#</th>{head('name','Oyuncu')}{head('total','Toplam')}{head('played','Maç')}{head('avg','Ort.')}{head('last3','Son 3')}{head('six','6+ %')}<th>Form</th>{gameweeks.map(g=>head('gw'+g,'MH'+g,weekMode&&g===weekSort?'selected-week-col':''))}</tr></thead>
        <tbody>{pageRows.map((p,i)=><tr className="team-player-row clickable-row" style={teamCssVars(p.team)} key={p.id} tabIndex={0}
          onClick={e=>openRow(e,p.id)} onKeyDown={e=>{if(e.key==='Enter')window.location.href='/players/'+p.id}}>
          <td className="rank-col">#{(safePage-1)*PAGE_SIZE+i+1}</td>
          <td className="weekly-player-cell"><Link className="player-link" href={'/players/'+p.id}><b>{p.full_name}</b></Link><small><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></small></td>
          <td className="summary-score"><b>{p.total}</b></td><td>{p.played}</td><td>{num(p.avg)}</td><td><b>{num(p.last3)}</b></td><td>{(p.sixPlus*100).toFixed(0)}%</td>
          <td><span className={'form-trend '+(p.trend>.5?'up':p.trend<-.5?'down':'flat')}>{p.trend>.5?'↑':p.trend<-.5?'↓':'→'}</span></td>
          {gameweeks.map(g=>{const row=p.pointMap.get(g),pending=g>finalThroughGameweek,selected=weekMode&&g===weekSort,stateClass=pending?'pending-score':row?'':'empty-score';return <td key={g} className={'weekly-score '+stateClass+' '+(selected?'selected-week-cell':'')}>{row?row.points:'—'}</td>})}
        </tr>)}</tbody>
      </table></div>
    }

    {rows.length>PAGE_SIZE?<div className="pagination-bar">
      <button type="button" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Önceki</button><span>Sayfa <b>{safePage}</b> / {pageCount}</span><button type="button" disabled={safePage>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Sonraki →</button>
    </div>:null}
  </>
}
