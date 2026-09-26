'use client'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { saveSquad } from '@/app/actions'
import { teamCssVars } from '@/lib/teamThemes'
import { availabilityCompactNote, availabilityIsIssue } from '@/lib/availability'

const LIMITS={GK:2,DEF:5,MID:5,FWD:3}
const MAX_PER_CLUB=null
const FORMATIONS={
  '3-4-3':{DEF:3,MID:4,FWD:3},
  '3-5-2':{DEF:3,MID:5,FWD:2},
  '4-3-3':{DEF:4,MID:3,FWD:3},
  '4-4-2':{DEF:4,MID:4,FWD:2},
  '4-5-1':{DEF:4,MID:5,FWD:1},
  '5-2-3':{DEF:5,MID:2,FWD:3},
  '5-3-2':{DEF:5,MID:3,FWD:2},
  '5-4-1':{DEF:5,MID:4,FWD:1},
}
const POS_ORDER={GK:0,DEF:1,MID:2,FWD:3}
const posLabel={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}

function xfp(p){return Number(p?.projection?.xfp||0)}
function totalPoints(p){return Number(p?.total_points||0)}
function stateSignature(payload=[]){
  return JSON.stringify([...payload]
    .map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.bench_order===null?null:Number(x.bench_order)}))
    .sort((a,b)=>a.player_id-b.player_id))
}
function fallbackName(name=''){
  const parts=String(name).trim().split(/\s+/).filter(Boolean)
  return parts.at(-1)||'—'
}
function displayName(player){
  return player?.display_name || fallbackName(player?.full_name)
}
function shirtMark(player){ return posLabel[player?.position] || player?.position || '—' }
function formationFromState(state,map){
  const starters=state.filter(x=>x.bench_order===null).map(x=>map.get(x.player_id)).filter(Boolean)
  if(starters.length!==11)return '4-3-3'
  const d=starters.filter(p=>p.position==='DEF').length
  const m=starters.filter(p=>p.position==='MID').length
  const f=starters.filter(p=>p.position==='FWD').length
  const key=`${d}-${m}-${f}`
  return FORMATIONS[key]?key:'4-3-3'
}
function buildXI(ids,formation,map){
  const need={GK:1,...FORMATIONS[formation]}
  const out=[]
  for(const pos of ['GK','DEF','MID','FWD']){
    const arr=ids.map(id=>map.get(id)).filter(p=>p?.position===pos).sort((a,b)=>xfp(b)-xfp(a))
    out.push(...arr.slice(0,need[pos]||0).map(p=>p.id))
  }
  return out
}

function bestXIPlan(ids,map){
  let best=null
  for(const key of Object.keys(FORMATIONS)){
    const lineup=buildXI(ids,key,map)
    if(lineup.length!==11)continue
    const lineupPlayers=lineup.map(id=>map.get(id)).filter(Boolean)
    const captain=[...lineupPlayers].sort((a,b)=>xfp(b)-xfp(a))[0]||null
    const base=lineupPlayers.reduce((sum,p)=>sum+xfp(p),0)
    const total=base+xfp(captain)
    if(!best||total>best.total)best={key,lineup,captain,base,total}
  }
  return best
}

function formationFromXIIds(ids,map){
  const players=ids.map(id=>map.get(id)).filter(Boolean)
  if(players.length!==11)return null
  const gk=players.filter(p=>p.position==='GK').length
  const d=players.filter(p=>p.position==='DEF').length
  const m=players.filter(p=>p.position==='MID').length
  const f=players.filter(p=>p.position==='FWD').length
  if(gk!==1 || d<3 || d>5 || m<2 || m>5 || f<1 || f>3)return null
  const key=`${d}-${m}-${f}`
  return FORMATIONS[key]?key:null
}

export default function SquadBuilder({ players, initialState=[], recommendedState=[], plan='free', gameweek }){
  const map=useMemo(()=>new Map(players.map(p=>[p.id,p])),[players])
  const initialIds=useMemo(()=>initialState.map(x=>x.player_id).filter(id=>map.has(id)),[initialState,map])
  const initialFormation=useMemo(()=>formationFromState(initialState,map),[initialState,map])
  const initialXI=useMemo(()=>{
    const fromSaved=initialState.filter(x=>x.bench_order===null).map(x=>x.player_id).filter(id=>map.has(id))
    return fromSaved.length===11?fromSaved:buildXI(initialIds,initialFormation,map)
  },[initialState,initialIds,initialFormation,map])

  const [ids,setIds]=useState(initialIds)
  const [formation,setFormation]=useState(initialFormation)
  const [xiIds,setXiIds]=useState(initialXI)
  const initialCaptainId=useMemo(()=>{
    const saved=initialState.find(x=>x.is_captain)?.player_id
    return saved&&initialXI.includes(saved)?saved:(initialXI.map(id=>map.get(id)).sort((a,b)=>xfp(b)-xfp(a))[0]?.id||null)
  },[initialState,initialXI,map])
  const [captainId,setCaptainId]=useState(initialCaptainId)
  const [q,setQ]=useState('')
  const [pos,setPos]=useState('')
  const [team,setTeam]=useState('')
  const [sortKey,setSortKey]=useState('xfp')
  const [sortDir,setSortDir]=useState('desc')
  const [swapTarget,setSwapTarget]=useState(null)
  const rosterRef=useRef(null)
  const lineupRef=useRef(null)
  const pickerRef=useRef(null)

  const selected=ids.map(id=>map.get(id)).filter(Boolean)
  const counts=selected.reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const cost=selected.reduce((s,p)=>s+Number(p.price||0),0)
  const bank=100-cost
  const clubCounts=selected.reduce((a,p)=>(a[p.team]=(a[p.team]||0)+1,a),{})
  const clubLimitOk=!MAX_PER_CLUB||Object.values(clubCounts).every(n=>n<=MAX_PER_CLUB)
  const validRoster=ids.length===15&&Object.entries(LIMITS).every(([k,v])=>(counts[k]||0)===v)&&cost<=100.0001&&clubLimitOk
  const liveFormation=formationFromXIIds(xiIds,map)
  const validXI=xiIds.length===11&&xiIds.every(id=>ids.includes(id))&&Boolean(liveFormation)&&liveFormation===formation
  const valid=validRoster&&validXI&&Boolean(captainId)&&xiIds.includes(captainId)

  const xi=xiIds.map(id=>map.get(id)).filter(Boolean)
  const bench=selected.filter(p=>!xiIds.includes(p.id)).sort((a,b)=>{
    if(a.position==='GK'&&b.position!=='GK')return -1
    if(b.position==='GK'&&a.position!=='GK')return 1
    return xfp(b)-xfp(a)
  })
  const xiTotal=xi.reduce((s,p)=>s+xfp(p),0)
  const captainBonus=xi.find(p=>p.id===captainId)?xfp(xi.find(p=>p.id===captainId)):0
  const xiCaptainTotal=xiTotal+captainBonus
  const selectedTotal=selected.reduce((s,p)=>s+xfp(p),0)
  const rosterByPos=useMemo(()=>Object.fromEntries(['GK','DEF','MID','FWD'].map(position=>[
    position,
    ids.map(id=>map.get(id)).filter(p=>p?.position===position).sort((a,b)=>xfp(b)-xfp(a))
  ])),[ids,map])
  const formationOptions=useMemo(()=>Object.keys(FORMATIONS).map(key=>{
    const lineup=buildXI(ids,key,map)
    const base=lineup.reduce((sum,id)=>sum+xfp(map.get(id)),0)
    const cap=lineup.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
    const total=lineup.length===11?base+xfp(cap):0
    return {key,lineup,base,total,captain:cap,complete:lineup.length===11}
  }).sort((a,b)=>b.total-a.total),[ids,map])
  const bestFormation=formationOptions.find(x=>x.complete)?.key||formation
  const captainCandidates=[...xi].sort((a,b)=>xfp(b)-xfp(a)).slice(0,3)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const candidates=useMemo(()=>{
    let out=players.filter(p=>
      (!pos||p.position===pos)&&
      (!team||p.team===team)&&
      (!q||(`${p.full_name} ${p.team} ${p.projection?.opponent_name||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
    )
    out=[...out].sort((a,b)=>{
      if(sortKey==='name'){
        const cmp=String(a.full_name||'').localeCompare(String(b.full_name||''),'tr')
        return sortDir==='asc'?cmp:-cmp
      }
      const av=sortKey==='price'?Number(a.price||0):sortKey==='points'?totalPoints(a):xfp(a)
      const bv=sortKey==='price'?Number(b.price||0):sortKey==='points'?totalPoints(b):xfp(b)
      return sortDir==='asc'?av-bv:bv-av
    })
    return out.slice(0,180)
  },[players,pos,team,q,sortKey,sortDir])

  const bestMove=useMemo(()=>{
    const currentPlan=bestXIPlan(ids,map)
    if(!currentPlan)return null
    let best=null
    for(const out of selected){
      for(const inn of players){
        if(ids.includes(inn.id)||inn.position!==out.position)continue
        if(Number(inn.price)>Number(out.price)+bank+0.001)continue
        const nextIds=ids.map(id=>id===out.id?inn.id:id)
        if(MAX_PER_CLUB){
          const nextPlayers=nextIds.map(id=>map.get(id)).filter(Boolean)
          const nextClubCounts=nextPlayers.reduce((a,p)=>(a[p.team]=(a[p.team]||0)+1,a),{})
          if(Object.values(nextClubCounts).some(n=>n>MAX_PER_CLUB))continue
        }
        const plan=bestXIPlan(nextIds,map)
        if(!plan)continue
        const gain=plan.total-currentPlan.total
        if(!best||gain>best.gain)best={out,inn,gain,plan,nextIds}
      }
    }
    return best
  },[selected,players,ids,bank,map])

  function applyBestMove(){
    if(!bestMove||bestMove.gain<=0)return
    setIds(bestMove.nextIds)
    setFormation(bestMove.plan.key)
    setXiIds(bestMove.plan.lineup)
    setCaptainId(bestMove.plan.captain?.id||null)
    setSwapTarget(null)
  }

  function rebuild(nextIds,nextFormation=formation){
    const nextXI=buildXI(nextIds,nextFormation,map)
    setXiIds(nextXI)
    if(!nextXI.includes(captainId)){
      const cap=nextXI.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
      setCaptainId(cap?.id||null)
    }
  }
  function add(id){
    const p=map.get(id)
    if(!p||ids.includes(id)||ids.length>=15)return
    if((counts[p.position]||0)>=LIMITS[p.position])return
    if(cost+Number(p.price)>100.0001)return
    const next=[...ids,id]
    setIds(next);rebuild(next)
  }
  function remove(id){
    const next=ids.filter(x=>x!==id)
    setIds(next)
    setSwapTarget(null)
    rebuild(next)
  }
  function changeFormation(next){
    const nextXI=buildXI(ids,next,map)
    setFormation(next)
    setXiIds(nextXI)
    const cap=nextXI.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
    setCaptainId(cap?.id||null)
    setSwapTarget(null)
  }

  function changePoolSort(nextKey){
    if(sortKey===nextKey){
      setSortDir(sortDir==='desc'?'asc':'desc')
      return
    }
    setSortKey(nextKey)
    setSortDir(nextKey==='name'?'asc':'desc')
  }
  function fillRecommended(){
    const next=recommendedState.map(x=>x.player_id).filter(id=>map.has(id)).slice(0,15)
    const recommendedFormation=formationFromState(recommendedState,map)
    const fromRecXI=recommendedState.filter(x=>x.bench_order===null).map(x=>x.player_id).filter(id=>next.includes(id))
    setIds(next)
    setFormation(recommendedFormation)
    const nextXI=fromRecXI.length===11?fromRecXI:buildXI(next,recommendedFormation,map)
    setXiIds(nextXI)
    const savedCap=recommendedState.find(x=>x.is_captain&&nextXI.includes(x.player_id))?.player_id
    setCaptainId(savedCap||nextXI.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]?.id||null)
    setSwapTarget(null)
  }
  function reset(){
    setIds([]);setXiIds([]);setCaptainId(null);setSwapTarget(null);setFormation('4-3-3')
  }
  function swapResult(firstId,secondId){
    if(!firstId||!secondId||firstId===secondId)return null
    const first=map.get(firstId)
    const second=map.get(secondId)
    if(!first||!second)return null
    const firstInXI=xiIds.includes(firstId)
    const secondInXI=xiIds.includes(secondId)
    if(firstInXI===secondInXI)return null

    const starterId=firstInXI?firstId:secondId
    const benchId=firstInXI?secondId:firstId
    const starter=map.get(starterId)
    const incoming=map.get(benchId)

    if(starter.position==='GK'||incoming.position==='GK'){
      if(starter.position!=='GK'||incoming.position!=='GK')return null
    }

    const nextXI=xiIds.map(id=>id===starterId?benchId:id)
    const nextFormation=formationFromXIIds(nextXI,map)
    if(!nextFormation)return null
    return {nextXI,nextFormation,starterId,benchId}
  }

  function handleSwap(id){
    if(!swapTarget){
      setSwapTarget(id)
      return
    }
    if(swapTarget===id){
      setSwapTarget(null)
      return
    }
    const result=swapResult(swapTarget,id)
    if(!result){
      setSwapTarget(id)
      return
    }
    setXiIds(result.nextXI)
    setFormation(result.nextFormation)
    if(!result.nextXI.includes(captainId)){
      const cap=result.nextXI.map(playerId=>map.get(playerId)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
      setCaptainId(cap?.id||null)
    }
    setSwapTarget(null)
  }

  function chooseEmptySlot(position){
    setPos(position)
    setQ('')
    pickerRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  function goToLineup(){
    lineupRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  function goToRoster(){
    rosterRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  const benchPayload=bench.map((p,i)=>({player_id:p.id,is_captain:false,bench_order:i+1}))
  const xiPayload=xi.map(p=>({player_id:p.id,is_captain:p.id===captainId,bench_order:null}))
  const savePayload=[...xiPayload,...benchPayload]
  const initialSignature=useMemo(()=>{
    const baseSelected=initialIds.map(id=>map.get(id)).filter(Boolean)
    const baseBench=baseSelected.filter(p=>!initialXI.includes(p.id)).sort((a,b)=>{
      if(a.position==='GK'&&b.position!=='GK')return -1
      if(b.position==='GK'&&a.position!=='GK')return 1
      return xfp(b)-xfp(a)
    })
    const basePayload=[
      ...initialXI.map(id=>({player_id:id,is_captain:id===initialCaptainId,bench_order:null})),
      ...baseBench.map((p,i)=>({player_id:p.id,is_captain:false,bench_order:i+1}))
    ]
    return stateSignature(basePayload)
  },[initialIds,initialXI,initialCaptainId,map])
  const currentSignature=stateSignature(savePayload)
  const [savedSignature,setSavedSignature]=useState(initialSignature)
  const [saveState,saveAction,isSaving]=useActionState(saveSquad,{ok:false,error:'',signature:''})
  useEffect(()=>{
    if(saveState?.ok&&saveState.signature)setSavedSignature(saveState.signature)
  },[saveState])
  const hasChanges=currentSignature!==savedSignature

  return <div className="my-squad-shell">
    <section className="squad-control-strip card">
      <div className="squad-control-stat">
        <span>Kadro</span>
        <b>{ids.length}<small>/15</small></b>
        <i><em style={{width:`${Math.min(100,ids.length/15*100)}%`}}/></i>
      </div>
      <div className="squad-control-stat">
        <span>Bütçe</span>
        <b>{cost.toFixed(1)}<small>m / 100m</small></b>
        <small>{bank.toFixed(1)}m banka</small>
      </div>
      <div className="squad-control-stat">
        <span>15 oyuncu xFP</span>
        <b>{selectedTotal.toFixed(1)}</b>
        <small>MH{gameweek||'—'} tahmini</small>
      </div>
      <div className="squad-toolbar">
        <button type="button" className="squad-tool-btn" onClick={fillRecommended}>Model Kadrosu</button>
        <button type="button" className="squad-tool-btn danger" onClick={reset}>Sıfırla</button>
        <button type="button" className="squad-tool-btn primary-jump" onClick={goToLineup} disabled={!validRoster}>İlk 11’i Diz ↓</button>
      </div>
    </section>

    <div className="my-squad-layout roster-builder-layout" ref={rosterRef}>
      <section className="squad-stage card roster-stage">
        <div className="squad-stage-head">
          <div>
            <span className="eyebrow">1. AŞAMA • 15 KİŞİLİK KADRO</span>
            <h2>Kadronu oluştur</h2>
          </div>
          <button type="button" className="squad-tool-btn jump-link" onClick={goToLineup} disabled={!validRoster}>İlk 11’i Diz ↓</button>
        </div>

        <div className="roster-pitch">
          <div className="pitch-mark center-line"/>
          <div className="pitch-mark center-circle"/>
          <div className="pitch-mark box top"/>
          <div className="pitch-mark box bottom"/>

          {['GK','DEF','MID','FWD'].map(position=><div className={`roster-row roster-${position}`} key={position}>
            {Array.from({length:LIMITS[position]},(_,slot)=>{
              const p=rosterByPos[position]?.[slot]
              if(p)return <div className="roster-player" key={p.id}>
                <button type="button" className="remove-player roster-remove" onClick={()=>remove(p.id)} aria-label="Oyuncuyu çıkar">×</button>
                <span className={`fantasy-shirt ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                <b>{displayName(p)}</b>
                <small>{p.team}</small>
                <div className="pitch-player-tags"><span>{Number(p.price||0).toFixed(1)}m</span><strong>{xfp(p).toFixed(1)} xFP</strong></div>
              </div>
              return <button type="button" className="roster-player empty-roster-slot" key={`${position}-${slot}`} onClick={()=>chooseEmptySlot(position)}>
                <span className={`fantasy-shirt empty-shirt ${position}`}><i>+</i></span>
                <b>Oyuncu ekle</b>
                <small>{posLabel[position]}</small>
              </button>
            })}
          </div>)}
        </div>
        <div className="roster-stage-foot">
          <span>Boş slota dokun → oyuncu havuzu o mevkiye filtrelenir.</span>
          <b>{validRoster?'Kadro tamamlandı ✓':'Önce 15 kişilik kadroyu tamamla'}</b>
        </div>
      </section>

      <aside className="player-picker card" ref={pickerRef}>
        <div className="player-picker-head">
          <div><span className="eyebrow">OYUNCU SEÇİMİ</span><h2>Oyuncu havuzu</h2></div>
          <span>{candidates.length}/{players.length}</span>
        </div>

        <div className="picker-filters">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/>
          <div className="picker-filter-center">
            <select value={pos} onChange={e=>setPos(e.target.value)}>
              <option value="">Tüm mevkiler</option>
              <option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
            </select>
            <select value={team} onChange={e=>setTeam(e.target.value)}>
              <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="picker-table-head">
          <span className="picker-shirt-head" aria-hidden="true"/>
          <button type="button" className={sortKey==='name'?'active':''} onClick={()=>changePoolSort('name')}>Oyuncu {sortKey==='name'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='price'?'active':''} onClick={()=>changePoolSort('price')}>Fiyat {sortKey==='price'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='xfp'?'active':''} onClick={()=>changePoolSort('xfp')}>xFP {sortKey==='xfp'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='points'?'active':''} onClick={()=>changePoolSort('points')} title="Toplam Puan">Puan {sortKey==='points'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <span className="picker-action-head" aria-hidden="true"/>
        </div>

        <div className="picker-list">
          {candidates.map(p=>{
            const chosen=ids.includes(p.id)
            const posFull=(counts[p.position]||0)>=LIMITS[p.position]
            const overBudget=!chosen&&cost+Number(p.price)>100.0001
            const disabled=!chosen&&(ids.length>=15||posFull||overBudget)
            const availabilityNote=(availabilityIsIssue(p.availability)||p.availability?.availability_type==='return')
              ? availabilityCompactNote(p.availability)
              : ''
            return <div className={`picker-player ${chosen?'chosen':''} ${disabled?'disabled':''}`} style={teamCssVars(p.team)} key={p.id}>
              <div className="picker-shirt-wrap"><span className={`fantasy-shirt tiny ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span></div>
              <div className="picker-copy">
                <b>{p.full_name}</b>
                <small><strong>{p.team}</strong><em>Rakip: {p.projection?.opponent_name||'—'}</em></small>
                {availabilityNote?<small className="picker-availability-note">{availabilityNote}</small>:null}
              </div>
              <div className={`picker-value price ${sortKey==='price'?'active':''}`}>{Number(p.price||0).toFixed(1)}m</div>
              <div className={`picker-value xfp ${sortKey==='xfp'?'active':''}`}>{xfp(p).toFixed(2)}</div>
              <div className={`picker-value points ${sortKey==='points'?'active':''}`}>{totalPoints(p).toFixed(0)}</div>
              <button
                type="button"
                className={chosen?'picker-remove-player':'picker-add-player'}
                onClick={()=>chosen?remove(p.id):add(p.id)}
                disabled={disabled}
                aria-label={chosen?'Oyuncuyu kadrodan çıkar':'Oyuncuyu kadroya ekle'}
              >{chosen?'−':'+'}</button>
            </div>
          })}
        </div>
      </aside>
    </div>

    <section className="card lineup-workbench" ref={lineupRef}>
      <div className="lineup-workbench-head">
        <div>
          <span className="eyebrow">2. AŞAMA • İLK 11 & TAKTİK</span>
          <h2>15 kişilik kadrodan en iyi 11’i çıkar</h2>
          <p>Formasyonu seç, xFP karşılaştırmasını gör ve kaptanı belirle.</p>
        </div>
        <button type="button" className="squad-tool-btn jump-link" onClick={goToRoster}>Kadroya Dön ↑</button>
      </div>

      <div className="formation-suggestions">
        {formationOptions.map(option=><button
          type="button"
          key={option.key}
          className={`formation-option ${formation===option.key?'selected':''} ${bestFormation===option.key&&option.complete?'best':''}`}
          onClick={()=>changeFormation(option.key)}
          disabled={!option.complete}
        >
          <span>{option.key}</span>
          <b>{option.complete?option.total.toFixed(1):'—'} <small>xFP</small></b>
          <em>{bestFormation===option.key&&option.complete?'En yüksek':'Kaptan dahil'}</em>
        </button>)}
      </div>

      <div className="lineup-layout">
        <div className="lineup-field-column">
          <div className="lineup-score-strip">
            <span><small>XI taban xFP</small><b>{xiTotal.toFixed(1)}</b></span>
            <span className="captain-total"><small>Kaptan bonusu</small><b>+{captainBonus.toFixed(1)}</b></span>
            <span className="lineup-total"><small>İlk 11 xFP</small><b>{xiCaptainTotal.toFixed(1)}</b></span>
          </div>

          <div className="my-squad-pitch lineup-pitch">
            <div className="formation-live-badge"><span>DİZİLİŞ</span><b>{liveFormation||formation}</b></div>
            <div className="pitch-mark center-line"/>
            <div className="pitch-mark center-circle"/>
            <div className="pitch-mark box top"/>
            <div className="pitch-mark box bottom"/>

            {['GK','DEF','MID','FWD'].map(position=><div className={`my-pitch-row row-${position}`} key={position}>
              {xi.filter(p=>p.position===position).map(p=>{
                const eligible=swapTarget&&swapTarget!==p.id&&Boolean(swapResult(swapTarget,p.id))
                return <div key={p.id} className={`my-pitch-player ${swapTarget===p.id?'swap-active':''} ${eligible?'swap-eligible':''}`}>
                  <button type="button" className="player-swap-hit" onClick={()=>handleSwap(p.id)} aria-label="Yedekle değiştir">
                    <span className={`fantasy-shirt ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                    <b>{displayName(p)}</b>
                    <small>{p.team}</small>
                    <div className="pitch-player-tags"><span>{Number(p.price||0).toFixed(1)}m</span><strong>{xfp(p).toFixed(1)} xFP</strong></div>
                  </button>
                  <button type="button" className={`captain-toggle ${p.id===captainId?'active':''}`} onClick={()=>setCaptainId(p.id)} aria-label="Kaptan yap">K</button>
                </div>
              })}
            </div>)}

            {xi.length<11?<div className="pitch-empty-state"><b>Önce 15 kişilik kadroyu tamamla</b><span>Üst bölümden oyuncu eklemeye devam et.</span></div>:null}
          </div>

          <div className="bench-zone lineup-bench-zone">
            <div className="bench-zone-head">
              <div><span className="eyebrow">YEDEKLER</span><b>{bench.length}/4</b></div>
              {swapTarget?<span className="swap-hint">Karşı taraftan uygun oyuncuya dokun → swap</span>:<span>İlk 11 veya yedekten bir oyuncuya dokunarak swap başlat</span>}
            </div>
            <div className="my-bench-row">
              {bench.map((p,i)=>{
                const eligible=swapTarget&&swapTarget!==p.id&&Boolean(swapResult(swapTarget,p.id))
                return <button
                  type="button"
                  key={p.id}
                  className={`my-bench-player ${swapTarget===p.id?'swap-active':''} ${eligible?'eligible':''} ${swapTarget&&!eligible&&swapTarget!==p.id?'swap-disabled':''}`}
                  onClick={()=>handleSwap(p.id)}
                >
                  <span className="bench-order">{i+1}</span>
                  <span className={`fantasy-shirt mini ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                  <span className="bench-copy"><b>{p.full_name}</b><small>{p.team} • {posLabel[p.position]} • {xfp(p).toFixed(1)} xFP</small></span>
                </button>
              })}
            </div>
          </div>
        </div>

        <aside className="captain-panel">
          <span className="eyebrow">KAPTAN ÖNERİSİ</span>
          <h3>En güçlü 3 aday</h3>
          <p>Kaptanın xFP’si iki kez sayılır. Seçim toplam İlk 11 xFP’yi anında değiştirir.</p>
          <div className="captain-candidates">
            {captainCandidates.map((p,i)=><button type="button" className={p.id===captainId?'active':''} onClick={()=>setCaptainId(p.id)} key={p.id}>
              <span>#{i+1}</span>
              <div><b>{p.full_name}</b><small>{p.team}</small></div>
              <strong>{xfp(p).toFixed(1)}<small>xFP</small></strong>
            </button>)}
          </div>
          <div className="captain-impact">
            <span>Seçili kaptan</span>
            <b>{xi.find(p=>p.id===captainId)?.full_name||'—'}</b>
            <strong>+{captainBonus.toFixed(1)} xFP</strong>
          </div>
        </aside>
      </div>

      <div className="squad-save-row">
        <div className="squad-validity">
          <span className={validRoster?'ok':''}>{validRoster?'✓':'○'} 2 KL / 5 DEF / 5 OS / 3 FOR</span>
          <span className={cost<=100?'ok':''}>{cost<=100?'✓':'○'} Bütçe limiti</span>
          <span className={validXI?'ok':''}>{validXI?'✓':'○'} {liveFormation===formation?'Seçili diziliş hazır':'XI dizilişi güncellenmeli'}</span>
        </div>
        <form action={saveAction} className="squad-save-form">
          <input type="hidden" name="player_ids" value={JSON.stringify(ids)}/>
          <input type="hidden" name="squad_state" value={JSON.stringify(savePayload)}/>
          <input type="hidden" name="squad_signature" value={currentSignature}/>
          {saveState?.error?<small className="save-squad-error">{saveState.error}</small>:null}
          <button className="cta save-squad-btn" disabled={!valid||!hasChanges||isSaving}>
            {isSaving?'Kaydediliyor…':hasChanges?'Takımı Kaydet':'Kaydedildi'}
          </button>
        </form>
      </div>
    </section>

    <section className="card squad-insight-bar">
      <div>
        <span className="eyebrow">MODEL ÖNERİSİ</span>
        <h2>{bestMove&&bestMove.gain>0?`${bestMove.out.full_name} → ${bestMove.inn.full_name}`:'Kadron şu an dengeli görünüyor'}</h2>
        {bestMove&&bestMove.gain>0?<p>Tek transferde yaklaşık <b>+{bestMove.gain.toFixed(2)} xFP</b> potansiyeli.</p>:<p>Mevcut xFP’ye göre pozitif tek transfer bulunamadı.</p>}
        {bestMove&&bestMove.gain>0?<button type="button" className="squad-tool-btn model-apply-btn" onClick={applyBestMove}>Öneriyi Uygula</button>:null}
      </div>
      <div className={`pro-lock ${plan==='pro'?'unlocked':''}`}>
        <span>PRO</span><b>3 MH Planlayıcı</b><small>{plan==='pro'?'Pro erişimin aktif.':'Çok haftalı transfer zinciri ve risk simülasyonu.'}</small>
      </div>
    </section>
  </div>
}
