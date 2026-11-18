'use client'
import {useMemo,useState} from 'react'
import Link from 'next/link'
import {scoreSquad} from '@/lib/squadScoring'
import {captainOptions,rankSingleTransfers,risingPlayers,squadFragility} from '@/lib/squadDecisionInsights.mjs'
import {playerLabel,playerFixtureMeta} from '@/lib/playerPresentation'
import {BUDGET,MAX_PLAYERS_PER_CLUB,TRANSFER_RULES} from '@/lib/rules'
import styles from './SquadDecisionLab.module.css'

const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'
const pct=n=>n===null||n===undefined?'—':Math.round(Number(n)*100)+'%'
const MODES=[{id:'balanced',label:'Dengeli'},{id:'safe',label:'Güvenli'},{id:'ceiling',label:'Yüksek tavan'}]

export default function SquadDecisionLab({players=[],ids=[],xiIds=[],captainId=null,
  initialCount=0,freeTransfersRemaining=1,managerCard='none',locked=false,
  plan='free',advancedRows=[],onApply}){
  const [mode,setMode]=useState('balanced')
  // Premium values are supplied only after server-side subscription verification
  // and the authenticated Pro RPC. Public player data is never patched globally.
  const enriched=useMemo(()=>{
    const overlay=new Map((advancedRows||[]).map(row=>[Number(row.player_id),row]))
    return players.map(player=>{
      const row=plan==='pro'?overlay.get(Number(player.id)):null
      if(!row)return player
      return {...player,projection:{...player.projection,p90:row.p90??null,
        six_plus_probability:row.six_plus_probability??null},
        role_signal:{last2_minutes:row.last2_minutes??null,
          previous2_minutes:row.previous2_minutes??null,
          last2_xi_probability:row.last2_xi_probability??null,
          previous2_xi_probability:row.previous2_xi_probability??null}}
    })
  },[players,advancedRows,plan])
  const map=useMemo(()=>new Map(enriched.map(p=>[Number(p.id),p])),[enriched])
  const captain=map.get(Number(captainId))
  const currentRisk=useMemo(()=>squadFragility(xiIds,map),[xiIds,map])
  const captainChoices=useMemo(()=>captainOptions(xiIds,captainId,map,2),[xiIds,captainId,map])
  const risers=useMemo(()=>risingPlayers(enriched,ids,6),[enriched,ids])
  const canCeiling=plan==='pro'&&enriched.some(p=>Number.isFinite(Number(p.projection?.p90))&&p.projection?.p90!==null)
  const activeMode=mode==='ceiling'&&!canCeiling?'balanced':mode
  const eligible=ids.length===15&&initialCount===15&&managerCard==='none'&&!locked
  const suggestions=useMemo(()=>eligible?rankSingleTransfers({
    ids,pool:enriched,playerMap:map,budget:BUDGET,freeRemaining:freeTransfersRemaining,
    hitCost:Number(TRANSFER_RULES.hit_cost)||4,clubMax:MAX_PLAYERS_PER_CLUB,mode:activeMode,
    scoreFn:(nextIds,options)=>scoreSquad(nextIds,{...options,weeks:[0]}),
    maxResults:5
  }):[],[eligible,ids,enriched,map,freeTransfersRemaining,activeMode])
  return <section className={'card '+styles.lab} aria-labelledby="squad-decision-lab-title">
    <header className={styles.head}>
      <div><span className={styles.eyebrow}>MH • KARAR ARAÇLARI</span>
        <h2 id="squad-decision-lab-title">Kadro karar laboratuvarı</h2>
        <p>Güncel haftanın yayımlanmış xFP, süre ve uygunluk tahminlerini kullanır. Öneriler otomatik kaydedilmez.</p>
      </div>
      <span className={styles.chip}>P2 · Karar desteği</span>
    </header>
    <div className={styles.sectionGrid}>
      <article className={styles.riskCard}>
        <h3>Kadro kırılganlığı</h3>
        {currentRisk?<div className={styles.riskStats}>
          <div><strong>{currentRisk.lowXI}</strong><span>İlk 11 olasılığı düşük</span></div>
          <div><strong>{currentRisk.lowMinutes}</strong><span>60 dk altı beklenti</span></div>
          <div><strong>{currentRisk.defensiveStacks}</strong><span>Aynı kulüp savunma ikilisi</span></div>
        </div>:<p>Risk özeti için geçerli bir ilk 11 kur.</p>}
        <small>Göstergeler tanısaldır; oyuncular arası ortak 50K senaryo korelasyonu hesaplanmış gibi sunulmaz.</small>
      </article>
      <article className={styles.riskCard}>
        <h3>Kaptan karşılaştırması</h3>
        {captainChoices.length?<div className={styles.captainRows}>
          {captainChoices.slice(0,3).map(item=><div key={item.id}>
            <div><b>{playerLabel(item.player)}</b><span>{item.id===Number(captainId)?'Mevcut kaptan':item.gain>0?'+'+fmt(item.gain,2)+' xFP':'+'+fmt(Math.max(0,item.gain),2)+' xFP'}</span></div>
            <small>{fmt(item.xfp,2)} xFP • İlk 11 {pct(item.xi)} • {item.minutes===null?'Dakika yok':fmt(item.minutes,0)+' dk'}</small>
            {plan==='pro'?<Link href={'/players/'+item.id+'#player-journal-title'}>Tahmin değişim günlüğü</Link>:null}
          </div>)}
        </div>:<p>İlk 11 ve kaptanı seçince karşılaştırma görünür.</p>}
        <small>Kaptan farkı yalnız ek kaptan çarpanının beklenen etkisidir. Kesin puan garantisi değildir.</small>
      </article>
    </div>
    <div className={styles.blockHeader}>
      <div><h3>Akıllı transfer asistanı</h3><p>Kurallara uygun tek transferler, otomatik yeni diziliş ve kaptan hesabıyla sıralanır.</p></div>
      <div className={styles.modeSwitch} role="group" aria-label="Transfer tercih profili">
        {MODES.map(item=><button key={item.id} type="button"
          disabled={item.id==='ceiling'&&!canCeiling}
          aria-pressed={activeMode===item.id}
          className={activeMode===item.id?styles.active:undefined}
          onClick={()=>setMode(item.id)}>{item.label}</button>)}
      </div>
    </div>
    {!eligible?<p className={styles.empty}>{locked?'Hafta kilitli: transfer önerileri salt okunur.':
      managerCard!=='none'?'Kart aktifken standart transfer puanı/formation hesabı uygulanmaz. Kartı kapatınca öneriler açılır.':
      'Transfer seçeneklerini görmek için 15 kişilik kadronu kaydet.'}</p>:
      suggestions.length?<div className={styles.moves}>
        {suggestions.map((move,index)=><article key={move.outgoing.id+'-'+move.incoming.id} className={styles.move}>
          <div className={styles.rank}>#{index+1}</div>
          <div className={styles.moveText}>
            <b>{playerLabel(move.outgoing)} <span aria-hidden="true">→</span> {playerLabel(move.incoming)}</b>
            <small>{move.incoming.team} • {fmt(move.difference,1)}m bütçe farkı • {fmt(move.gross,2)} brüt xFP</small>
            <small>Yeni kaptan: {playerLabel(move.plan.captain)} • İlk 11: {move.plan.key} • Yedek: {move.plan.bench.length} oyuncu</small>
            {move.hit?<small>{move.hit} puan transfer cezası hesaba katıldı.</small>:null}
          </div>
          <div className={styles.moveAction}><strong>+{fmt(move.net,2)}<small>net xFP</small></strong>
            <button type="button" onClick={()=>onApply?.(move)}>Kadromda dene</button></div>
        </article>)}
      </div>:<p className={styles.empty}>Mevcut kadrona göre pozitif net xFP sağlayan uygun tek transfer bulunamadı. Sırf değişiklik için -4 puana girme.</p>}
    <div className={styles.blockHeader}>
      <div><h3>Sürpriz Oyuncu Avcısı</h3><p>Son iki maçlık ortalama dakika sinyali, önceki iki maçlık pencereyle karşılaştırılır.</p></div>
      <span className={styles.chip}>{plan==='pro'?'Kaynaklı rol penceresi':'Gelişmiş veri'}</span>
    </div>
    {plan!=='pro'?<p className={styles.empty}>Doğrulanmış son dönem rol ve dakika pencereleri Gelişmiş üyelik verisidir. Eksik veriden yükseliş üretilmez.</p>:
      risers.length?<div className={styles.risers}>{risers.map(({player,recent,previous,change,xiChange})=>
        <Link key={player.id} href={'/players/'+player.id} className={styles.riser}>
          <div><strong>{playerLabel(player)}</strong><small>{playerFixtureMeta(player)}</small></div>
          <span>+{fmt(change,0)} dk <small>{fmt(previous,0)} → {fmt(recent,0)}</small></span>
          <em>{xiChange===null?'XI eğilimi yok':(xiChange>=0?'+':'')+fmt(xiChange*100,0)+' puan XI%'}</em>
        </Link>)}</div>:
      <p className={styles.empty}>Şu an kaynaklı iki dönem arasında belirgin dakika artışı gösteren aday yok veya sinyal yüklenemedi.</p>}
    <p className={styles.note}>Bu panel güncel haftanın karar yardımcısıdır; risk ve yükseliş sıralamaları ayrı bir Monte Carlo koşusu değildir. Oyuncu P90 verisi yalnız Gelişmiş üyeye açıkken tavan tercihi etkinleşir.</p>
  </section>
}
