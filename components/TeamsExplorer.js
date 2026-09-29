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
  ['xg_diff','Sezon xG farkı'],
  ['possession','Topa sahip olma'],
]

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
  const head=(key,label)=><th onClick={()=>changeSort(key)}>{label}{sort===key?<span className="sortmark">{dir==='asc'?' ↑':' ↓'}</span>:null}</th>

  return <>
    <div className="filters team-analysis-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Takım veya rakip ara..." aria-label="Takım ara"/>
      <select value={venue} onChange={e=>setVenue(e.target.value)}>
        <option value="">Tüm saha durumları</option>
        <option value="HOME">Ev sahibi</option>
        <option value="AWAY">Deplasman</option>
      </select>
      <select value={attack} onChange={e=>setAttack(e.target.value)}>
        <option value="">Tüm hücum eşleşmeleri</option>
        <option value="good">Avantajlı</option>
        <option value="neutral">Dengeli</option>
        <option value="tough">Dezavantajlı</option>
      </select>
      <select value={sort} onChange={e=>{setSort(e.target.value);setDir('desc')}}>
        {sortOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
    </div>

    <div className="table-summary"><b>{filtered.length}</b> takım • MH{gameweek||'—'} rakipleri ve takım profili</div>

    {!filtered.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen takım bulunamadı.</div>:<>
      <div className="team-analysis-card-list">
        {filtered.map(team=><Link href={'/teams/'+team.id} className="card team-analysis-mobile-card team-accent-card" style={teamCssVars(team.name)} key={team.id}>
          <div className="team-analysis-mobile-head">
            <span className="team-mini-shirt" aria-hidden="true"><i/></span>
            <div><b>{team.name}</b><small>{team.fixtures?.length>1?`${team.fixtures.length} maç`:team.venue}</small></div>
            <strong>{num(team.total_xfp,1)}<small>xFP</small></strong>
          </div>
          <div className="team-analysis-fixtures">
            {(team.fixtures||[]).map((f,i)=><span key={i}><em>{venueLabel(f.venue)}</em><b>{f.opponent}</b></span>)}
          </div>
          <div className="team-analysis-mobile-metrics">
            <div><span>Bu hafta xG</span><b>{num(team.xg)}</b></div>
            <div><span>Rakip xG</span><b>{num(team.oppXg)}</b></div>
            <div><span>Galibiyet</span><b>{pct(team.win)}</b></div>
            <div><span>CS</span><b>{pct(team.cs)}</b></div>
            <div><span>Sezon xG/maç</span><b>{num(team.season_xg_per_match)}</b></div>
            <div><span>xG farkı</span><b>{num(team.xg_diff)}</b></div>
          </div>
          <div className="team-analysis-matchup-line">
            <span className={'matchup-pill '+team.attack_level}>Hücum: {matchupLabel[team.attack_level]}</span>
            <span className={'matchup-pill '+team.defense_level}>Savunma: {matchupLabel[team.defense_level]}</span>
          </div>
        </Link>)}
      </div>

      <div className="card table-wrap desktop-team-analysis-table">
        <table>
          <thead><tr>
            <th>Takım</th><th>MH{gameweek||'—'} rakibi</th><th>E/D</th>
            {head('xg','Bu hafta xG')}<th>Rakip xG</th>{head('win','Galibiyet')}{head('cs','CS')}
            {head('total_xfp','Toplam xFP')}{head('season_xg_per_match','Sezon xG/maç')}{head('season_xga_per_match','xGA/maç')}
            {head('xg_diff','xG farkı')}{head('possession','Topa sahip olma')}
          </tr></thead>
          <tbody>{filtered.map(team=><tr className="team-analysis-row" style={teamCssVars(team.name)} key={team.id}>
            <td><Link className="team-analysis-name" href={'/teams/'+team.id}><span className="team-mini-shirt" aria-hidden="true"><i/></span><b>{team.name}</b></Link></td>
            <td><div className="team-analysis-opponents">{(team.fixtures||[]).map((f,i)=><Link href={'/teams/'+f.opponent_id} key={i}>{f.opponent}</Link>)}</div></td>
            <td>{(team.fixtures||[]).map((f,i)=><span className="venue-mini" key={i}>{venueLabel(f.venue)}</span>)}</td>
            <td><b>{num(team.xg)}</b><small className={'matchup-inline '+team.attack_level}>{matchupLabel[team.attack_level]}</small></td>
            <td>{num(team.oppXg)}</td><td>{pct(team.win)}</td><td>{pct(team.cs)}</td>
            <td><b>{num(team.total_xfp,1)}</b></td><td>{num(team.season_xg_per_match)}</td><td>{num(team.season_xga_per_match)}</td>
            <td>{num(team.xg_diff)}</td><td>{num(team.possession,1)}%</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </>
}
