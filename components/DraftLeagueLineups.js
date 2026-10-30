'use client'
import {useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {draftFixtureMeta} from '@/lib/draftFixtureMeta'
import s from './DraftLeagueLineups.module.css'

const labels={GK:'KALECİ',DEF:'DEFANS',MID:'ORTA SAHA',FWD:'FORVET'}
const groups=['FWD','MID','DEF','GK']
const cards={none:'Standart',triple_captain:'Tripleks Kaptan · 3×',quad_captain:'Dört Dörtlük Kaptan · 4×',bench_boost:'Tüm Takım Sahaya'}
const fmt=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})

export default function DraftLeagueLineups({roomId,picks=[],pool=[]}){
 const client=useMemo(()=>createClient(),[])
 const [state,setState]=useState(null)
 const [selected,setSelected]=useState('')
 const [error,setError]=useState('')
 const players=useMemo(()=>{
  const byId=new Map(pool.map(p=>[Number(p.id),p]))
  return new Map(picks.map(p=>[Number(p.player_id),{
   ...byId.get(Number(p.player_id)),
   id:Number(p.player_id),name:p.player_name,position:p.position,xfp:Number(p.xfp||0)
  }]))
 },[picks,pool])
 useEffect(()=>{
  if(!roomId)return
  let active=true
  const read=async()=>{
   const {data,error:rpcError}=await client.rpc('scout_draft_lineup_state',{p_room_id:roomId})
   if(!active)return
   if(rpcError){setError(String(rpcError.message||rpcError).slice(0,160));return}
   if(data?.league_active){setState(data);setError('')}
  }
  void read()
  return()=>{active=false}
 },[roomId,client])
 const teams=state?.teams||[]
 const focused=teams.find(t=>String(t.team_id)===String(selected))||
  teams.find(t=>t.mine)||teams[0]
 const xi=(focused?.starters||[]).map(Number)
 const substitutes=(focused?.bench||[]).map(Number)
 const xiTotal=xi.reduce((sum,id)=>sum+(players.get(id)?.xfp||0),0)
 return <section className={s.wrap} aria-label="Onaylanmış draft kadroları">
  <div className={s.heading}>
   <div><small>MH{state?.gameweek||'—'} · KESİNLEŞEN KADROLAR</small>
    <h2>Kurulan İlk 11'ler</h2>
    <p>Tüm menajerler kadrolarını onayladı. Aşağıdan takımları seçerek ilk 11, yedek, kaptan ve kullanılan kartlarını inceleyebilirsin. Bu haftanın seçimleri artık değiştirilemez.</p>
   </div>
   <span className={s.lock}><span aria-hidden="true">✓</span> Herkes hazır · Kadrolar kilitli</span>
  </div>
  {error&&<p role="alert" className={s.error}>Onaylanmış kadrolar yüklenemedi: {error}</p>}
  {!state?<p className={s.loading}>Onaylanmış kadrolar yükleniyor…</p>:<>
   <div className={s.teams} role="group" aria-label="Takım kadrosu seçimi">
    {teams.map(t=><button type="button" key={t.team_id} aria-pressed={focused?.team_id===t.team_id}
      className={s.team+(focused?.team_id===t.team_id?' '+s.teamActive:'')}
      onClick={()=>setSelected(t.team_id)}>
      <strong>{t.name}{t.mine?' · SEN':''}</strong>
      <small>{t.formation||'—'} · Onaylı ✓</small>
    </button>)}
   </div>
   {focused&&<div className={s.detail}>
    <div className={s.summary}>
     <div><small>SEÇİLEN TAKIM</small><h3>{focused.name}</h3><p>{focused.formation} · {cards[focused.card]||'Standart'} · MH{state.gameweek}</p></div>
     <div className={s.estimated}><span>İlk 11 xFP</span><strong>{fmt(xiTotal)}</strong><small>Tahmin · Gerçek puan değil</small></div>
    </div>
    <div className={s.pitch} aria-label={focused.name+' ilk 11'}>
     {groups.map(position=><div className={s.pitchLine} key={position}>
      <small className={s.lineLabel}>{labels[position]}</small>
      <div className={s.pitchPlayers}>{xi.filter(id=>players.get(id)?.position===position).map(id=>{
       const p=players.get(id)
       return <div className={s.shirt} key={id}>
        <div className={s.shirtIcon} aria-hidden="true">{id===Number(focused.captain)?'C':'11'}</div>
        <strong>{p?.name||'Oyuncu'}</strong>
        <small className={s.fixtureMeta}>{draftFixtureMeta(p)}</small>
        <small>{fmt(p?.xfp)} xFP{id===Number(focused.captain)?' · KAPTAN':''}</small>
       </div>
      })}</div>
     </div>)}
    </div>
    <div className={s.bench}>
     <div className={s.benchTitle}><h4>Yedekler</h4><span>1 kaleci + 3 saha oyuncusu · Öncelik sırası</span></div>
     <div className={s.benchList}>{substitutes.map((id,i)=>{
      const p=players.get(id)
      return <div className={s.benchPlayer} key={id}><span className={s.benchIndex}>{i===0?'KL':i}</span>
       <div><strong>{p?.name||'Oyuncu'}</strong><small className={s.fixtureMeta}>{draftFixtureMeta(p)}</small></div>
       <span className={s.benchXfp}>{fmt(p?.xfp)} xFP</span></div>
     })}</div>
    </div>
   </div>}
  </>}
 </section>
}
