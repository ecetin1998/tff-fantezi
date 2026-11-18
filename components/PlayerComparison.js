'use client'
import {useMemo,useState} from 'react'
import Link from 'next/link'
import {comparePlayerMetrics} from '@/lib/playerComparison.mjs'
import {playerLabel,playerFixtureMeta} from '@/lib/playerPresentation'
import styles from './PlayerComparison.module.css'

const validNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))
const decimal=(value,digits=2)=>validNumber(value)?Number(value).toLocaleString('tr-TR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—'
const winner=(row,left,right)=>{
  if(!row||row.first==='—'||row.second==='—')return 'Veri yetersiz'
  if(row.better==='left')return playerLabel(left)
  if(row.better==='right')return playerLabel(right)
  return 'Eşit'
}
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

export default function PlayerComparison({players=[],isPro=false,proReady=false}){
  const [leftId,setLeftId]=useState('')
  const [rightId,setRightId]=useState('')
  const list=useMemo(()=>[...players].filter(p=>p?.active).sort((a,b)=>
    playerLabel(a).localeCompare(playerLabel(b),'tr')),[players])
  const byId=useMemo(()=>new Map(list.map(p=>[String(p.id),p])),[list])
  const first=byId.get(leftId)||null
  const second=byId.get(rightId)||null
  const rows=comparePlayerMetrics(first,second,{isPro,proReady})
  const ready=rows.length>0
  const xfpRow=rows.find(row=>row.key==='xfp')
  const valueRow=rows.find(row=>row.key==='value')

  function PlayerPicker({side,player,value,onChange,otherId}){
    const label=side===1?'1. Oyuncu':'2. Oyuncu'
    const selectId='player-compare-'+side
    return <div className={styles.pickerCard}>
      <div className={styles.pickerTop}>
        <label htmlFor={selectId}>{label}</label>
        {player?<span className={styles.chosen}>Seçildi</span>:null}
      </div>
      <select id={selectId} value={value} onChange={event=>onChange(event.target.value)} aria-label={label}>
        <option value="">Oyuncu seç…</option>
        {list.map(p=><option key={p.id} value={String(p.id)} disabled={String(p.id)===otherId}>
          {playerLabel(p)} · {p.team} ({posLabel(p.position)})
        </option>)}
      </select>
      {player?<div className={styles.playerPreview}>
        <div className={styles.playerDetails}>
          <Link href={'/players/'+player.id}>{playerLabel(player)}</Link>
          <span>{playerFixtureMeta(player)}</span>
        </div>
        <div className={styles.playerStats}>
          <span><small>xFP</small><strong>{decimal(player.projection?.xfp)}</strong></span>
          <span><small>Fiyat</small><strong>{decimal(player.price,1)}m</strong></span>
        </div>
      </div>:<p className={styles.pickerHint}>Seçtiğinde oyuncu özeti burada görünecek.</p>}
    </div>
  }

  return <section className={'card player-compare-panel '+styles.panel} id="player-compare-panel" aria-labelledby="compare-title">
    <div className={styles.heading}>
      <div className={styles.headingCopy}>
        <span className={styles.eyebrow}>OYUNCU KARŞILAŞTIRMA</span>
        <h2 id="compare-title">İki futbolcuyu yan yana incele</h2>
        <p>xFP, dakika, fiyat ve puan beklentilerini tek bakışta kıyasla.</p>
      </div>
      <div className={styles.headingActions}>
        <span className={styles.poolCount}>{list.length} oyuncu</span>
        {leftId||rightId?<button type="button" className={styles.reset} onClick={()=>{setLeftId('');setRightId('')}}>Temizle</button>:null}
      </div>
    </div>
    <div className={styles.pickerGrid}>
      <PlayerPicker side={1} player={first} value={leftId} onChange={setLeftId} otherId={rightId}/>
      <span className={styles.versus} aria-hidden="true">VS</span>
      <PlayerPicker side={2} player={second} value={rightId} onChange={setRightId} otherId={leftId}/>
    </div>
    {ready?<div className={styles.results}>
      <div className={styles.insightGrid} aria-label="Metrik üstünlükleri">
        <div className={styles.insight}><span>xFP avantajı</span><strong>{winner(xfpRow,first,second)}</strong><small>Beklenen haftalık puan</small></div>
        <div className={styles.insight}><span>F/P avantajı</span><strong>{winner(valueRow,first,second)}</strong><small>Modelin fiyat/verim ölçümü</small></div>
      </div>
      <div className={styles.metricsWrap}>
        <table className={styles.metrics} aria-label="İki oyuncunun model göstergeleri">
          <thead><tr>
            <th scope="col"><Link href={'/players/'+first.id}>{playerLabel(first)}</Link></th>
            <th scope="col">Gösterge</th>
            <th scope="col"><Link href={'/players/'+second.id}>{playerLabel(second)}</Link></th>
          </tr></thead>
          <tbody>{rows.map(row=><tr key={row.key}>
            <td className={row.better==='left'?styles.better:undefined}>{row.first}</td>
            <th scope="row">{row.label}</th>
            <td className={row.better==='right'?styles.better:undefined}>{row.second}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>:<div className={styles.empty} role="status" aria-live="polite">
      <span className={styles.emptyIcon} aria-hidden="true">⇄</span>
      <p>{first||second?'Karşılaştırmak için diğer oyuncuyu da seç.':'İki oyuncu seç, farkları burada gör.'}</p>
    </div>}
    {isPro&&!proReady?<p className={styles.notice} role="status">Gelişmiş P90 ve 6+ verileri yüklenince karşılaştırmaya eklenir.</p>:null}
    {ready?<p className={styles.disclaimer}>Vurgu yalnızca ilgili ölçümün sayısal üstünlüğüdür; fiyat için düşük, diğer ölçümlerde yüksek değer avantajdır. Kesin maç sonucu veya genel oyuncu tercihi değildir.</p>:null}
  </section>
}
