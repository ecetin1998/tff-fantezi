'use client'
import {useMemo,useState} from 'react'
import Link from 'next/link'
import {comparePlayerMetrics} from '@/lib/playerComparison.mjs'
import {playerLabel} from '@/lib/playerPresentation'

export default function PlayerComparison({players=[],isPro=false,proReady=false}){
  const [leftId,setLeftId]=useState('')
  const [rightId,setRightId]=useState('')
  const list=useMemo(()=>[...players].filter(x=>x?.active).sort((a,b)=>
    playerLabel(a).localeCompare(playerLabel(b),'tr')),[players])
  const byId=useMemo(()=>new Map(list.map(x=>[String(x.id),x])),[list])
  const first=byId.get(leftId)||null,second=byId.get(rightId)||null
  const rows=comparePlayerMetrics(first,second,{isPro,proReady})
  return <details className="card player-compare-panel" id="player-compare-panel">
    <summary><span>OYUNCU KARŞILAŞTIRMA</span><strong>İki futbolcuyu yan yana incele</strong><small>xFP, ilk 11, dakika ve F/P • dokunarak aç</small></summary>
    <div className="player-compare-content">
      <p>İki oyuncuyu seç. Değerler güncel modelin tahminidir; bir oyuncunun kesin daha çok puan alacağı anlamına gelmez.</p>
      <div className="player-compare-selectors">
        <label>1. Oyuncu
          <select value={leftId} onChange={e=>setLeftId(e.target.value)}>
            <option value="">Oyuncu seç...</option>
            {list.map(p=><option key={p.id} value={String(p.id)} disabled={String(p.id)===rightId}>{playerLabel(p)} · {p.team} ({p.position})</option>)}
          </select>
        </label>
        <label>2. Oyuncu
          <select value={rightId} onChange={e=>setRightId(e.target.value)}>
            <option value="">Oyuncu seç...</option>
            {list.map(p=><option key={p.id} value={String(p.id)} disabled={String(p.id)===leftId}>{playerLabel(p)} · {p.team} ({p.position})</option>)}
          </select>
        </label>
      </div>
      {rows.length?<div className="player-compare-metrics" role="table" aria-label="İki oyuncu analizi">
        <div role="row" className="player-compare-metric-row player-compare-head">
          <span role="columnheader">Ölçüm</span>
          <Link role="columnheader" href={'/players/'+first.id}>{playerLabel(first)}</Link>
          <Link role="columnheader" href={'/players/'+second.id}>{playerLabel(second)}</Link>
        </div>
        {rows.map(row=><div role="row" className="player-compare-metric-row" key={row.key}>
          <span role="rowheader">{row.label}</span>
          <b role="cell" className={row.better==='left'?'is-better':''}>{row.first}</b>
          <b role="cell" className={row.better==='right'?'is-better':''}>{row.second}</b>
        </div>)}
      </div>:<p className="player-compare-empty">Karşılaştırma için iki farklı oyuncu seç.</p>}
      {isPro&&!proReady?<p className="muted">Gelişmiş P90 ve 6+ verileri yüklenince karşılaştırmaya eklenir.</p>:null}
      <p className="muted">Yeşil vurgulanan değer yalnızca o ölçümdeki sayısal üstünlüğü gösterir; fiyat için düşük, diğer ölçümler için yüksek değer esas alınır.</p>
    </div>
  </details>
}
