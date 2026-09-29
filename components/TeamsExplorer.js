'use client'

import {useMemo,useState} from 'react'
import Link from 'next/link'
import {teamCssVars} from '@/lib/teamThemes'

const matchupLabel={good:'Avantajlı',neutral:'Dengeli',tough:'Dezavantajlı'}
const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
const num=(v,d=2)=>Number(v||0).toFixed(d)
const venueLabel=v=>v==='HOME'?'Ev sahibi':v==='AWAY'?'Deplasman':'—'
const normalize=value=>String(value||'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i')

const sortOptions=[
  ['xg','Bu hafta xG'],
  ['win','Galibiyet ihtimali'],
  ['cs','Clean sheet ihtimali'],
  ['total_xfp','Takım toplam xFP'],
  ['season_xg_per_match','Sezon xG / maç'],
  ['season_xga_per_match','Sezon xGA / maç'],
  ['oppXg','Bu hafta rakip xG'],
]
const sortLabels=Object.fromEntries(sortOptions)

export default function TeamsExplorer({teams=[],gameweek}){
  const [q,setQ]=useState('')
  const [venue,setVenue]=useState('')
  const [attack,setAttack]=useState('')
  const [sort,setSort]=useState('xg')
  const [dir,setDir]=useState('desc')

  const filtered=useMemo(()=>{
    const needle=normalize(q)
    return [...teams].filter(team=>{
      const fixtures=team.fixtures||[]
      const venueMatch=!venue||fixtures.some(f=>f.venue===venue)
      const attackMatch=!attack||team.attack_level===attack
      const searchMatch=!needle||normalize([team.name,team.opponent,...fixtures.map(f=>f.opponent)].join(' ')).includes(needle)
      return venueMatch&&attackMatch&&searchMatch
    }).sort((a,b)=>{
      const av=Number(a?.[sort]||0),bv=Number(b?.[sort]||0)
      return dir==='asc'?av-bv:bv-av
    })
  },[teams,q,venue,attack,sort,dir])

  const changeSort=key=>{
    if(sort===key)setDir(v=>v==='desc'?'asc':'desc')
    else{setSort(key);setDir('desc')}
  }
  const head=(key,label)=><th className={sort===key?'team-analysis-sort-head is-selected':''} onClick={()=>changeSort(key)}>{label}{sort===key?<span className="sortmark">{dir==='asc'?' ↑':' ↓'}</span>:null}</th>
  const metricClass=key=>'team-analysis-mobile-metric'+(sort===key?' is-selected':'')
  const cellClass=key=>sort===key?'is-selected-column':''
  const attackSelected=team=>Boolean(attack&&team.attack_level===attack)

  return <>
    <div className="filters team-analysis-filters">
      <input className={q?'is-active-filter':''} value={q} onChange={e=>setQ(e.target.value)} placeholder="Takım veya rakip ara..." aria-label="Takım ara"/>
      <select className={venue?'is-active-filter':''} value={venue} onChange={e=>setVenue(e.target.value)}>
        <option value="">Tüm saha durumları</option>
        <option value="HOME">Ev sahibi</option>
        <option value="AWAY">Deplasman</option>
      </select>
      <select className={attack?'is-active-filter':''} value={attack} onChange={e=>setAttack(e.target.value)}>
        <option value="">Tüm hücum eşleşmeleri</option>
        <option value="good">Avantajlı</option>
        <option value="neutral">Dengeli</option>
        <option value="tough">Dezavantajlı</option>
      </select>
      <select className="is-active-filter sort-filter" value={sort} onChange={e=>{setSort(e.target.value);setDir('desc')}}>
        {sortOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
    </div>

    <div className="active-team-filters" aria-label="Seçili takım analizi alanları">
      <span className="active-filter-label">Seçili</span>
      {q?<button type="button" className="active-filter-chip search" onClick={()=>setQ('')}>Arama: {q}<b>×</b></button>:null}
      {venue?<button type="button" className="active-filter-chip venue" onClick={()=>setVenue('')}>{venueLabel(venue)}<b>×</b></button>:null}
      {attack?<button type="button" className={'active-filter-chip matchup '+attack} onClick={()=>setAttack('')}>Hücum: {matchupLabel[attack]}<b>×</b></button>:null}
      <button type="button" className="active-filter-chip sort" onClick={()=>setDir(v=>v==='desc'?'asc':'desc')}>
        {sortLabels[sort]} {dir==='asc'?'↑':'↓'}
      </button>
    </div>

    <div className="table-summary"><b>{filtered.length}</b> takım • MH{gameweek||'—'} rakipleri ve takım profili</div>

    {!filtered.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen takım bulunamadı.</div>:<>
      <div className="team-analysis-card-list">
        {filtered.map(team=><Link href={'/teams/'+team.id} className="card team-analysis-mobile-card team-accent-card" style={teamCssVars(team.name)} key={team.id}>
          <div className="team-analysis-mobile-head">
            <span className="team-mini-shirt" aria-hidden="true"><i/></span>
            <div><b>{team.name}</b><small>{team.fixtures?.length>1?`${team.fixtures.length} maç`:team.venue}</small></div>
            <strong className={sort==='total_xfp'?'is-selected-metric':''}>{num(team.total_xfp,1)}<small>xFP</small></strong>
          </div>
          <div className="team-analysis-fixtures">
            {(team.fixtures||[]).map((f,i)=><span className={venue&&f.venue===venue?'is-selected-fixture':''} key={i}><em>{venueLabel(f.venue)}</em><b>{f.opponent}</b></span>)}
          </div>
          <div className="team-analysis-mobile-metrics">
            <div className={metricClass('xg')}><span>Bu hafta xG</span><b>{num(team.xg)}</b></div>
            <div className={metricClass('oppXg')}><span>Bu hafta rakip xG</span><b>{num(team.oppXg)}</b></div>
            <div className={metricClass('win')}><span>Galibiyet</span><b>{pct(team.win)}</b></div>
            <div className={metricClass('cs')}><span>CS</span><b>{pct(team.cs)}</b></div>
            <div className={metricClass('season_xg_per_match')}><span>Sezon xG/maç</span><b>{num(team.season_xg_per_match)}</b></div>
            <div className={metricClass('season_xga_per_match')}><span>Sezon xGA/maç</span><b>{num(team.season_xga_per_match)}</b></div>
            <div className={metricClass('xg_diff')}><span>xG farkı</span><b>{num(team.xg_diff)}</b></div>
            <div className={metricClass('possession')}><span>Topa sahip olma</span><b>{num(team.possession,1)}%</b></div>
          </div>
          <div className="team-analysis-matchup-line">
            <span className={'matchup-pill '+team.attack_level+(attackSelected(team)?' is-selected-filter':'')}>Hücum: {matchupLabel[team.attack_level]}</span>
            <span className={'matchup-pill '+team.defense_level}>Savunma: {matchupLabel[team.defense_level]}</span>
          </div>
        </Link>)}
      </div>

      <div className="card table-wrap desktop-team-analysis-table">
        <table>
          <thead><tr>
            <th>Takım</th><th>MH{gameweek||'—'} rakibi</th><th className={venue?'is-filtered-head':''}>E/D</th>
            {head('xg','Bu hafta xG')}{head('oppXg','Bu hafta rakip xG')}{head('win','Galibiyet')}{head('cs','CS')}
            {head('total_xfp','Toplam xFP')}{head('season_xg_per_match','Sezon xG/maç')}{head('season_xga_per_match','xGA/maç')}
            {head('xg_diff','xG farkı')}{head('possession','Topa sahip olma')}
          </tr></thead>
          <tbody>{filtered.map(team=><tr className="team-analysis-row" style={teamCssVars(team.name)} key={team.id}>
            <td><Link className="team-analysis-name" href={'/teams/'+team.id}><span className="team-mini-shirt" aria-hidden="true"><i/></span><b>{team.name}</b></Link></td>
            <td><div className="team-analysis-opponents">{(team.fixtures||[]).map((f,i)=><Link href={'/teams/'+f.opponent_id} key={i}>{f.opponent}</Link>)}</div></td>
            <td className={venue?'is-filtered-cell':''}>{(team.fixtures||[]).map((f,i)=><span className={'venue-mini'+(venue&&f.venue===venue?' is-selected-filter':'')} key={i}>{venueLabel(f.venue)}</span>)}</td>
            <td className={(cellClass('xg')+' '+(attack?'is-filtered-cell':'')).trim()}><b>{num(team.xg)}</b><small className={'matchup-inline '+team.attack_level+(attackSelected(team)?' is-selected-filter':'')}>{matchupLabel[team.attack_level]}</small></td>
            <td className={cellClass('oppXg')}>{num(team.oppXg)}</td><td className={cellClass('win')}>{pct(team.win)}</td><td className={cellClass('cs')}>{pct(team.cs)}</td>
            <td className={cellClass('total_xfp')}><b>{num(team.total_xfp,1)}</b></td><td className={cellClass('season_xg_per_match')}>{num(team.season_xg_per_match)}</td><td className={cellClass('season_xga_per_match')}>{num(team.season_xga_per_match)}</td>
            <td className={cellClass('xg_diff')}>{num(team.xg_diff)}</td><td className={cellClass('possession')}>{num(team.possession,1)}%</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </>
}
