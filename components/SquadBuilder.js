'use client'
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { saveSquad } from '@/app/actions'
import {createClient} from '@/lib/supabase/client'
import { teamCssVars } from '@/lib/teamThemes'
import { availabilityCompactNote, availabilityIsIssue } from '@/lib/availability'
import {BUDGET,FORMATION_MAP,MAX_PLAYERS_PER_CLUB,SQUAD_LIMITS,SQUAD_SIZE,STARTING_GK,STARTING_XI_SIZE,TRANSFER_RULES} from '@/lib/rules'
import {pitchPlayerLabel,playerLabel} from '@/lib/playerPresentation'
import ManagerCardPicker from '@/components/ManagerCardPicker'
import {ATTACK_FORMATIONS,MANAGER_CARDS,MANAGER_CARD_NONE,captainMultiplierForCard,managerCardInfo,normalizeManagerCard,squadLimitsForCard} from '@/lib/managerCards'
import {scoreSquad} from '@/lib/squadScoring'
const POS_ORDER={GK:0,DEF:1,MID:2,FWD:3}
const posLabel={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}
const ATTACK_FORMATION_MAP=Object.freeze(Object.fromEntries(ATTACK_FORMATIONS.map(value=>{
  const [DEF,MID,FWD]=value.split('-').map(Number)
  return [value,Object.freeze({DEF,MID,FWD})]
})))

function xfp(p){return Number(p?.projection?.xfp||0)}
function totalPoints(p){return Number(p?.total_points||0)}
function formatCountdown(ms){
  const total=Math.max(0,Math.floor(ms/1000))
  const days=Math.floor(total/86400),hours=Math.floor((total%86400)/3600),minutes=Math.floor((total%3600)/60)
  return days>0?`${days}g ${hours}s ${minutes}dk`:`${hours}s ${minutes}dk`
}
function DeadlineCountdown({deadlineAt,locked}){
  const [now,setNow]=useState(()=>Date.now())
  useEffect(()=>{
    if(!deadlineAt||locked)return
    const timer=setInterval(()=>setNow(Date.now()),1000)
    return ()=>clearInterval(timer)
  },[deadlineAt,locked])
  const expired=Boolean(deadlineAt&&now>=new Date(deadlineAt).getTime())
  return <small>{locked||expired?'Kadro salt okunur.':deadlineAt?`İlk maçtan 1 saat önce • ${formatCountdown(Math.max(0,new Date(deadlineAt).getTime()-now))}`:'Takvim bekleniyor'}</small>
}
function formatDeadline(value){
  if(!value)return '—'
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return '—'
  return new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(date)
}
function stateSignature(payload=[]){
  return JSON.stringify([...payload]
    .map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.bench_order===null?null:Number(x.bench_order)}))
    .sort((a,b)=>a.player_id-b.player_id))
}

function cardRecommendationState(data){
  if(!Array.isArray(data?.members))return []
  return data.members.map(row=>({
    player_id:Number(row.player_id),
    is_captain:Boolean(row.is_captain),
    bench_order:row.squad_slot==='XI'?null:Number(row.sort_order||0),
  })).filter(row=>Number.isFinite(row.player_id))
}
function cardRecommendationXfp(data){
  const value=data?.recommendation?.xi_xfp_with_card??data?.recommendation?.captain_xfp??data?.recommendation?.xi_xfp
  const parsed=Number(value)
  return Number.isFinite(parsed)?parsed:null
}
function displayName(player){ return pitchPlayerLabel(player) }
function shirtMark(player){ return posLabel[player?.position] || player?.position || '—' }
function formationMapForCard(value){
  return normalizeManagerCard(value)==='attack'?ATTACK_FORMATION_MAP:FORMATION_MAP
}
function formationFromState(state,map,formationMap=FORMATION_MAP){
  const starters=state.filter(x=>x.bench_order===null).map(x=>map.get(x.player_id)).filter(Boolean)
  if(starters.length!==STARTING_XI_SIZE)return '4-3-3'
  const d=starters.filter(p=>p.position==='DEF').length
  const m=starters.filter(p=>p.position==='MID').length
  const f=starters.filter(p=>p.position==='FWD').length
  const key=`${d}-${m}-${f}`
  return formationMap[key]?key:'4-3-3'
}
function buildXI(ids,formation,map,formationMap=FORMATION_MAP){
  const need={GK:STARTING_GK,...formationMap[formation]}
  const out=[]
  for(const pos of ['GK','DEF','MID','FWD']){
    const arr=ids.map(id=>map.get(id)).filter(p=>p?.position===pos).sort((a,b)=>xfp(b)-xfp(a))
    out.push(...arr.slice(0,need[pos]||0).map(p=>p.id))
  }
  return out
}
function bestXIPlan(ids,map,formationMap=FORMATION_MAP,captainMultiplier=2){
  let best=null
  for(const key of Object.keys(formationMap)){
    const lineup=buildXI(ids,key,map,formationMap)
    if(lineup.length!==STARTING_XI_SIZE)continue
    const lineupPlayers=lineup.map(id=>map.get(id)).filter(Boolean)
    const captain=[...lineupPlayers].filter(p=>p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]||null
    const base=lineupPlayers.reduce((sum,p)=>sum+xfp(p),0)
    const total=base+xfp(captain)*Math.max(0,captainMultiplier-1)
    if(!best||total>best.total)best={key,lineup,captain,base,total}
  }
  return best
}

function formationFromXIIds(ids,map,formationMap=FORMATION_MAP){
  const players=ids.map(id=>map.get(id)).filter(Boolean)
  if(players.length!==STARTING_XI_SIZE)return null
  const gk=players.filter(p=>p.position==='GK').length
  const d=players.filter(p=>p.position==='DEF').length
  const m=players.filter(p=>p.position==='MID').length
  const f=players.filter(p=>p.position==='FWD').length
  if(gk!==STARTING_GK)return null
  const key=`${d}-${m}-${f}`
  return formationMap[key]?key:null
}

export default function SquadBuilder({ players, initialState=[], recommendedState=[], initialManagerCard=MANAGER_CARD_NONE, plan='free', gameweek, deadlineAt=null, locked=false, transferScenarios=[], futurePlan=null, transferRights=null, recommendedRunId=null, poolRunId=null }){
  const map=useMemo(()=>new Map(players.map(p=>[p.id,p])),[players])
  const normalizedInitialManagerCard=plan==='pro'?normalizeManagerCard(initialManagerCard):MANAGER_CARD_NONE
  const initialFormationMap=useMemo(()=>formationMapForCard(normalizedInitialManagerCard),[normalizedInitialManagerCard])
  const initialIds=useMemo(()=>initialState.map(x=>x.player_id).filter(id=>map.has(id)),[initialState,map])
  const initialFormation=useMemo(()=>formationFromState(initialState,map,initialFormationMap),[initialState,map,initialFormationMap])
  const initialXI=useMemo(()=>{
    const fromSaved=initialState.filter(x=>x.bench_order===null).map(x=>x.player_id).filter(id=>map.has(id))
    return fromSaved.length===11?fromSaved:buildXI(initialIds,initialFormation,map,initialFormationMap)
  },[initialState,initialIds,initialFormation,map,initialFormationMap])

  const [managerCard,setManagerCard]=useState(normalizedInitialManagerCard)
  const cardInfo=managerCardInfo(managerCard)
  const effectiveFormationMap=useMemo(()=>formationMapForCard(managerCard),[managerCard])
  const captainMultiplier=captainMultiplierForCard(managerCard)
  const effectiveSquadLimits=squadLimitsForCard(managerCard,SQUAD_LIMITS)
  const effectiveBudget=cardInfo.unlimitedBudget?Number.POSITIVE_INFINITY:Number(cardInfo.budget||BUDGET)

  const [ids,setIds]=useState(initialIds)
  const [formation,setFormation]=useState(initialFormation)
  const [xiIds,setXiIds]=useState(initialXI)
  const initialCaptainId=useMemo(()=>{
    const saved=initialState.find(x=>x.is_captain)?.player_id
    const savedPlayer=saved?map.get(saved):null
    return saved&&initialXI.includes(saved)&&savedPlayer?.position!=='GK'?saved:(initialXI.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]?.id||null)
  },[initialState,initialXI,map])
  const [captainId,setCaptainId]=useState(initialCaptainId)
  const isLocked=locked
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
  const bank=Number.isFinite(effectiveBudget)?effectiveBudget-cost:Number.POSITIVE_INFINITY
  const baselineUsed=Number(transferRights?.used||0)
  const liveChanges=initialIds.filter(id=>!ids.includes(id)).length
  const transfersUsed=baselineUsed+liveChanges
  const bankedTransfers=Math.max(1,Number(transferRights?.banked||TRANSFER_RULES.free_per_week||1))
  const freeTransfersRemaining=Math.max(0,bankedTransfers-transfersUsed)
  const clubCounts=selected.reduce((a,p)=>(a[p.team_id]=(a[p.team_id]||0)+1,a),{})
  const clubLimitOk=!MAX_PLAYERS_PER_CLUB||Object.values(clubCounts).every(n=>n<=MAX_PLAYERS_PER_CLUB)
  const budgetOk=!Number.isFinite(effectiveBudget)||cost<=effectiveBudget+.0001
  const validRoster=ids.length===SQUAD_SIZE&&Object.entries(effectiveSquadLimits).every(([k,v])=>(counts[k]||0)===v)&&budgetOk&&clubLimitOk
  const liveFormation=formationFromXIIds(xiIds,map,effectiveFormationMap)
  const validXI=xiIds.length===STARTING_XI_SIZE&&xiIds.every(id=>ids.includes(id))&&Boolean(liveFormation)&&liveFormation===formation
  const valid=validRoster&&validXI&&Boolean(captainId)&&xiIds.includes(captainId)&&map.get(captainId)?.position!=='GK'

  const xi=xiIds.map(id=>map.get(id)).filter(Boolean)
  const benchValue=p=>{
    const availability=Number(p?.projection?.availability_probability??1)
    const appearance=Math.max(Number(p?.projection?.xi_probability||0),Math.min(1,Number(p?.projection?.x_minutes||0)/90))
    return availability*appearance*xfp(p)
  }
  const bench=selected.filter(p=>!xiIds.includes(p.id)).sort((a,b)=>{
    if(a.position==='GK'&&b.position!=='GK')return -1
    if(b.position==='GK'&&a.position!=='GK')return 1
    return benchValue(b)-benchValue(a)
  })
  const xiTotal=xi.reduce((s,p)=>s+xfp(p),0)
  const selectedTotal=selected.reduce((s,p)=>s+xfp(p),0)
  const captainPlayer=xi.find(p=>p.id===captainId)
  const captainBonus=captainPlayer?xfp(captainPlayer)*Math.max(0,captainMultiplier-1):0
  const scoringBase=cardInfo.benchBoost?selectedTotal:xiTotal
  const xiCaptainTotal=scoringBase+captainBonus
  const scoringPlayers=cardInfo.benchBoost?selected:xi
  const bandTotal=key=>{
    const base=scoringPlayers.reduce((sum,p)=>sum+Number(p?.projection?.[key]??xfp(p)),0)
    const captainBand=captainPlayer?Number(captainPlayer?.projection?.[key]??xfp(captainPlayer))*Math.max(0,captainMultiplier-1):0
    return base+captainBand
  }
  const riskP25=bandTotal('p25')
  const riskP90=bandTotal('p90')
  const rosterByPos=useMemo(()=>Object.fromEntries(['GK','DEF','MID','FWD'].map(position=>[
    position,
    ids.map(id=>map.get(id)).filter(p=>p?.position===position).sort((a,b)=>xfp(b)-xfp(a))
  ])),[ids,map])
  const formationOptions=useMemo(()=>{
    const ranked=Object.keys(effectiveFormationMap).map(key=>{
      const lineup=buildXI(ids,key,map,effectiveFormationMap)
      const base=lineup.reduce((sum,id)=>sum+xfp(map.get(id)),0)
      const cap=lineup.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
      const countedBase=cardInfo.benchBoost?selectedTotal:base
      const total=lineup.length===STARTING_XI_SIZE?countedBase+xfp(cap)*Math.max(0,captainMultiplier-1):0
      return {key,lineup,base,total,captain:cap,complete:lineup.length===STARTING_XI_SIZE}
    }).sort((a,b)=>b.total-a.total)
    return managerCard==='attack'?ranked.slice(0,8):ranked
  },[ids,map,effectiveFormationMap,cardInfo.benchBoost,selectedTotal,captainMultiplier,managerCard])
  const bestFormation=formationOptions.find(x=>x.complete)?.key||formation
  const standardRecommendationXfp=useMemo(()=>{
    const xiRows=recommendedState.filter(row=>row.bench_order===null).map(row=>map.get(Number(row.player_id))).filter(Boolean)
    if(xiRows.length!==STARTING_XI_SIZE)return null
    const base=xiRows.reduce((sum,p)=>sum+xfp(p),0)
    const savedCaptainId=Number(recommendedState.find(row=>row.is_captain)?.player_id||0)
    const captain=xiRows.find(p=>p.id===savedCaptainId)||[...xiRows].filter(p=>p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
    return base+xfp(captain)
  },[recommendedState,map])

  const [cardRecommendations,setCardRecommendations]=useState({})
  const [loadingCards,setLoadingCards]=useState(()=>new Set())
  const [isAutoFilling,setIsAutoFilling]=useState(false)
  const [isSquadUpdating,startSquadUpdate]=useTransition()
  const [autoFillError,setAutoFillError]=useState('')
  const [simulation,setSimulation]=useState(null)

  useEffect(()=>{
    setCardRecommendations(current=>({
      ...current,
      [MANAGER_CARD_NONE]:{state:recommendedState,xfp:standardRecommendationXfp}
    }))
  },[recommendedState,standardRecommendationXfp])

  useEffect(()=>{
    if(plan!=='pro')return
    let cancelled=false
    const cards=MANAGER_CARDS.filter(card=>card.id!==MANAGER_CARD_NONE)
    setLoadingCards(new Set(cards.map(card=>card.id)))
    const supabase=createClient()
    Promise.all(cards.map(async card=>{
      try{
        const {data,error}=await supabase.functions.invoke('manager-card-recommendation',{
          body:{card:card.id,variant:'recommended'}
        })
        if(error||data?.error)throw error||new Error(data.error)
        if(!cancelled)setCardRecommendations(current=>({
          ...current,
          [card.id]:{data,state:cardRecommendationState(data),xfp:cardRecommendationXfp(data)}
        }))
      }catch{
        // Bir kartın önizleme isteği başarısız olursa diğer kartları engelleme.
      }finally{
        if(!cancelled)setLoadingCards(current=>{
          const next=new Set(current);next.delete(card.id);return next
        })
      }
    }))
    return ()=>{cancelled=true}
  },[plan])

  const managerCardPreviewXfp=useMemo(()=>Object.fromEntries(
    MANAGER_CARDS.map(card=>[card.id,cardRecommendations[card.id]?.xfp??null])
  ),[cardRecommendations])
  const captainCandidates=[...xi].filter(p=>p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a)).slice(0,3)
  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const candidates=useMemo(()=>{
    let out=players.filter(p=>
      (!pos||p.position===pos)&&
      (!team||p.team===team)&&
      (!q||(`${p.full_name} ${p.short_label||''} ${p.team} ${p.projection?.opponent_name||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
    )
    out=[...out].sort((a,b)=>{
      if(sortKey==='name'){
        const cmp=playerLabel(a).localeCompare(playerLabel(b),'tr')
        return sortDir==='asc'?cmp:-cmp
      }
      const av=sortKey==='price'?Number(a.price||0):sortKey==='points'?totalPoints(a):xfp(a)
      const bv=sortKey==='price'?Number(b.price||0):sortKey==='points'?totalPoints(b):xfp(b)
      return sortDir==='asc'?av-bv:bv-av
    })
    return out
  },[players,pos,team,q,sortKey,sortDir])
  const visibleCandidates=candidates

  const recommendationRunMismatch=Boolean(recommendedRunId&&poolRunId&&recommendedRunId!==poolRunId)
  const missingRecommended=useMemo(()=>recommendedState.filter(x=>!map.has(Number(x.player_id))),[recommendedState,map])
  const recommendedIds=useMemo(
    ()=>recommendedState.map(x=>Number(x.player_id)).filter(id=>map.has(id)).slice(0,SQUAD_SIZE),
    [recommendedState,map]
  )
  const recommendedXiIds=useMemo(
    ()=>recommendedState.filter(x=>x.bench_order===null).map(x=>Number(x.player_id)).filter(id=>map.has(id)),
    [recommendedState,map]
  )
  const recommendedCaptainId=useMemo(
    ()=>Number(recommendedState.find(x=>x.is_captain)?.player_id||0)||null,
    [recommendedState]
  )
  const recommendedRosterMatch=useMemo(()=>{
    if(recommendedIds.length!==SQUAD_SIZE||ids.length!==SQUAD_SIZE)return false
    const recommendedSet=new Set(recommendedIds)
    return ids.every(id=>recommendedSet.has(id))
  },[recommendedIds,ids])
  const recommendedLineupMatch=useMemo(()=>{
    if(!recommendedRosterMatch||recommendedXiIds.length!==STARTING_XI_SIZE)return false
    const currentSet=new Set(xiIds)
    return recommendedXiIds.every(id=>currentSet.has(id))&&captainId===recommendedCaptainId
  },[recommendedRosterMatch,recommendedXiIds,xiIds,captainId,recommendedCaptainId])

  const modelMove=useMemo(()=>{
    if(recommendationRunMismatch||missingRecommended.length||recommendedIds.length!==SQUAD_SIZE||ids.length!==SQUAD_SIZE||recommendedRosterMatch)return null
    const currentScored=scoreSquad(ids,{playerMap:map,weeks:[0],captainMultiplier})
    const currentPlan=currentScored.firstWeek,currentScore=currentScored.total
    if(!currentPlan)return null
    const recommendedSet=new Set(recommendedIds),currentSet=new Set(ids)
    const outs=selected.filter(p=>!recommendedSet.has(p.id))
    const ins=recommendedIds.map(id=>map.get(id)).filter(p=>p&&!currentSet.has(p.id))
    let best=null
    for(const out of outs)for(const inn of ins){
      if(inn.position!==out.position||Number(inn.price)>Number(out.price)+bank+0.001)continue
      const nextIds=ids.map(id=>id===out.id?inn.id:id)
      const nextPlayers=nextIds.map(id=>map.get(id)).filter(Boolean)
      const counts=nextPlayers.reduce((a,p)=>(a[p.team_id]=(a[p.team_id]||0)+1,a),{})
      if(MAX_PLAYERS_PER_CLUB&&Object.values(counts).some(n=>n>MAX_PLAYERS_PER_CLUB))continue
      const scored=scoreSquad(nextIds,{playerMap:map,weeks:[0],captainMultiplier})
      if(!scored.firstWeek)continue
      const gain=scored.total-currentScore,hitCost=freeTransfersRemaining>0?0:Number(TRANSFER_RULES.hit_cost||4)
      const candidate={out,inn,gain,netGain:gain-hitCost,hitCost,plan:scored.firstWeek,nextIds}
      if(!best||candidate.netGain>best.netGain)best=candidate
    }
    return best
  },[recommendedIds,recommendedRosterMatch,ids,selected,bank,map,freeTransfersRemaining,captainMultiplier,recommendationRunMismatch,missingRecommended])

  function applyModelMove(){
    if(!modelMove||modelMove.netGain<=0)return
    setIds(modelMove.nextIds)
    setFormation(modelMove.plan.key)
    setXiIds(modelMove.plan.lineup)
    setCaptainId(modelMove.plan.captain?.id||null)
    setSwapTarget(null)
  }

  function rebuild(nextIds,nextFormation=formation){
    const nextXI=buildXI(nextIds,nextFormation,map,effectiveFormationMap)
    setXiIds(nextXI)
    if(!nextXI.includes(captainId)){
      const cap=nextXI.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
      const nextCaptain=cap?.id||null
      setCaptainId(nextCaptain)
    }
  }
  function add(id){
    const p=map.get(id)
    if(!p||ids.includes(id)||ids.length>=SQUAD_SIZE)return
    if((counts[p.position]||0)>=effectiveSquadLimits[p.position])return
    if(MAX_PLAYERS_PER_CLUB&&(clubCounts[p.team_id]||0)>=MAX_PLAYERS_PER_CLUB)return
    if(Number.isFinite(effectiveBudget)&&cost+Number(p.price)>effectiveBudget+.0001)return
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
    const nextXI=buildXI(ids,next,map,effectiveFormationMap)
    setFormation(next)
    setXiIds(nextXI)
    const cap=nextXI.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
    const nextCaptain=cap?.id||null
    setCaptainId(nextCaptain)
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
  function applyRecommendationState(state){
    const next=state.map(x=>Number(x.player_id)).filter(id=>map.has(id)).slice(0,SQUAD_SIZE)
    const recommendedFormation=formationFromState(state,map,effectiveFormationMap)
    const fromRecXI=state.filter(x=>x.bench_order===null).map(x=>Number(x.player_id)).filter(id=>next.includes(id))
    setIds(next)
    setFormation(recommendedFormation)
    const nextXI=fromRecXI.length===STARTING_XI_SIZE&&formationFromXIIds(fromRecXI,map,effectiveFormationMap)
      ?fromRecXI
      :buildXI(next,recommendedFormation,map,effectiveFormationMap)
    setXiIds(nextXI)
    const savedCap=Number(state.find(x=>x.is_captain&&nextXI.includes(Number(x.player_id)))?.player_id||0)||null
    const nextCaptain=savedCap||nextXI.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]?.id||null
    setCaptainId(nextCaptain)
    setSwapTarget(null)
  }

  async function fillRecommended(){
    if(isLocked||isAutoFilling)return
    setAutoFillError('')
    if(managerCard!==MANAGER_CARD_NONE&&plan!=='pro')return
    setIsAutoFilling(true)
    try{
      if(managerCard===MANAGER_CARD_NONE){
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
        startSquadUpdate(()=>applyRecommendationState(recommendedState))
        return
      }
      let entry=cardRecommendations[managerCard]
      if(!entry?.state?.length){
        const supabase=createClient()
        const {data,error}=await supabase.functions.invoke('manager-card-recommendation',{
          body:{card:managerCard,variant:'recommended'}
        })
        if(error||data?.error)throw error||new Error(data.error)
        entry={data,state:cardRecommendationState(data),xfp:cardRecommendationXfp(data)}
        setCardRecommendations(current=>({...current,[managerCard]:entry}))
      }
      if(!entry?.state?.length)throw new Error('Bu kart için optimize kadro oluşturulamadı.')
      startSquadUpdate(()=>applyRecommendationState(entry.state))
    }catch{
      setAutoFillError('Seçili kart için otomatik kadro hazırlanamadı. Tekrar deneyebilirsin.')
    }finally{
      setIsAutoFilling(false)
    }
  }
  function reset(){
    const fallback=effectiveFormationMap['4-3-3']?'4-3-3':Object.keys(effectiveFormationMap)[0]
    startSquadUpdate(()=>{
      setIds([]);setXiIds([]);setCaptainId(null);setSwapTarget(null);setFormation(fallback);setSimulation(null)
    })
  }

  function simulatePlayer(target){
    if(isLocked)return
    if(ids.length!==SQUAD_SIZE){
      setSimulation({error:'Önce 15 kişilik kadronu tamamla; sonra oyuncunun kadrona etkisini hesaplayabilirim.'})
      return
    }
    if(ids.includes(target.id)){
      setSimulation({error:'Bu oyuncu zaten kadroda.'})
      return
    }
    const currentPlan=bestXIPlan(ids,map,effectiveFormationMap,captainMultiplier)
    if(!currentPlan){
      setSimulation({error:'Mevcut kadro için geçerli ilk 11 bulunamadı.'})
      return
    }
    let best=null
    for(const out of selected.filter(p=>p.position===target.position)){
      const nextCost=cost-Number(out.price||0)+Number(target.price||0)
      if(Number.isFinite(effectiveBudget)&&nextCost>effectiveBudget+.0001)continue
      const nextIds=ids.map(id=>id===out.id?target.id:id)
      if(MAX_PLAYERS_PER_CLUB){
        const nextPlayers=nextIds.map(id=>map.get(id)).filter(Boolean)
        const nextClubCounts=nextPlayers.reduce((a,p)=>(a[p.team_id]=(a[p.team_id]||0)+1,a),{})
        if(Object.values(nextClubCounts).some(n=>n>MAX_PLAYERS_PER_CLUB))continue
      }
      const nextPlan=bestXIPlan(nextIds,map,effectiveFormationMap,captainMultiplier)
      if(!nextPlan)continue
      const delta=nextPlan.total-currentPlan.total
      const candidate={out,target,nextIds,currentPlan,nextPlan,delta,nextCost}
      if(!best||candidate.delta>best.delta)best=candidate
    }
    setSimulation(best||{error:'Bu oyuncuyu mevcut bütçe, mevki ve kulüp sınırlarıyla kadroya ekleyemiyorum.'})
  }

  function applySimulation(){
    if(!simulation?.nextIds||!simulation?.nextPlan||isLocked)return
    setIds(simulation.nextIds)
    setFormation(simulation.nextPlan.key)
    setXiIds(simulation.nextPlan.lineup)
    setCaptainId(simulation.nextPlan.captain?.id||null)
    setSwapTarget(null)
    setSimulation(null)
  }

  function changeManagerCard(value){
    if(plan!=='pro'||isLocked)return
    const next=normalizeManagerCard(value)
    const nextMap=formationMapForCard(next)
    setManagerCard(next)
    if(ids.length===SQUAD_SIZE){
      const planForCard=bestXIPlan(ids,map,nextMap,captainMultiplierForCard(next))
      if(planForCard){
        setFormation(planForCard.key)
        setXiIds(planForCard.lineup)
        setCaptainId(planForCard.captain?.id||null)
      }
    }else if(!nextMap[formation]){
      const fallback=nextMap['4-3-3']?'4-3-3':Object.keys(nextMap)[0]
      setFormation(fallback)
      const nextXI=buildXI(ids,fallback,map,nextMap)
      setXiIds(nextXI)
      const cap=nextXI.map(id=>map.get(id)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
      setCaptainId(cap?.id||null)
    }
    setSwapTarget(null)
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
    const nextFormation=formationFromXIIds(nextXI,map,effectiveFormationMap)
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
      const cap=result.nextXI.map(playerId=>map.get(playerId)).filter(p=>p&&p.position!=='GK').sort((a,b)=>xfp(b)-xfp(a))[0]
      const nextCaptain=cap?.id||null
      setCaptainId(nextCaptain)
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
    return normalizedInitialManagerCard+'|'+stateSignature(basePayload)
  },[initialIds,initialXI,initialCaptainId,map,normalizedInitialManagerCard])
  const currentSignature=managerCard+'|'+stateSignature(savePayload)
  const [savedSignature,setSavedSignature]=useState(initialSignature)
  const [saveState,saveAction,isSaving]=useActionState(saveSquad,{ok:false,error:'',signature:''})
  useEffect(()=>{
    if(saveState?.ok&&saveState.signature)setSavedSignature(saveState.signature)
  },[saveState])
  const hasChanges=currentSignature!==savedSignature

  return <div className="my-squad-shell">
    <section className="squad-control-strip card">
      <div className={`squad-deadline-status ${isLocked?'locked':''}`}>
        <span>{isLocked?'HAFTA KİLİTLİ':'KADRO SON TARİHİ'}</span>
        <b>{formatDeadline(deadlineAt)}</b>
        <DeadlineCountdown deadlineAt={deadlineAt} locked={locked}/>
      </div>
      <div className="squad-control-stat">
        <span>Kadro</span>
        <b>{ids.length}<small>/{SQUAD_SIZE}</small></b>
        <i><em style={{width:`${Math.min(100,ids.length/SQUAD_SIZE*100)}%`}}/></i>
      </div>
      <div className="squad-control-stat">
        <span>Bütçe</span>
        <b>{cost.toFixed(1)}<small>{cardInfo.unlimitedBudget?'m / sınırsız':`m / ${effectiveBudget.toFixed(0)}m`}</small></b>
        <small>{cardInfo.unlimitedBudget?'Bütçe sınırı yok':`Kalan: ${bank.toFixed(1)}m`}</small>
      </div>
      <div className="squad-control-stat">
        <span>{SQUAD_SIZE} oyuncu xFP</span>
        <b>{selectedTotal.toFixed(1)}</b>
        <small>MH{gameweek||'—'} tahmini</small>
      </div>

    </section>

    <div className="my-squad-layout roster-builder-layout" ref={rosterRef}>
      <section className="squad-stage card roster-stage">
        <div className="squad-stage-head">
          <div>
            <span className="eyebrow">1. AŞAMA • {SQUAD_SIZE} KİŞİLİK KADRO</span>
            <h2>Kadronu oluştur</h2>
          </div>
          <div className="squad-stage-actions">
            <button type="button" className="squad-tool-btn auto-fill-btn" onClick={fillRecommended} disabled={isLocked||isAutoFilling||isSquadUpdating||(managerCard!==MANAGER_CARD_NONE&&plan!=='pro')} aria-busy={isAutoFilling||isSquadUpdating}>{isAutoFilling||isSquadUpdating?'Dolduruluyor…':'Otomatik Doldur'}</button>
            <button type="button" className="squad-tool-btn danger" onClick={reset} disabled={isLocked||isAutoFilling||isSquadUpdating}>Sıfırla</button>
            <button type="button" className="squad-tool-btn jump-link" onClick={goToLineup} disabled={!validRoster||isAutoFilling||isSquadUpdating}>İlk 11’i Diz ↓</button>
          </div>
        </div>
        {autoFillError?<small className="save-squad-error auto-fill-error">{autoFillError}</small>:null}

        <div className={`manager-card-roster-control ${managerCard!==MANAGER_CARD_NONE?'active':''} ${plan==='pro'?'unlocked':'locked'}`}>
          <div className="manager-card-roster-copy">
            <div>
              <span className="eyebrow">GELİŞMİŞ • MENAJER KARTI</span>
              <h3>{plan==='pro'?cardInfo.label:'Menajer kartı seçimi'}</h3>
            </div>
            <div className="manager-card-roster-effect">
              {plan!=='pro'
                ?<span>Gelişmiş üyelikte açılır</span>
                :cardInfo.attack
                  ?<><span>2 KL</span><span>3 DEF</span><span>5 OS</span><span>5 FOR</span></>
                  :cardInfo.unlimitedBudget
                    ?<span>Bütçe sınırı yok</span>
                    :cardInfo.benchBoost
                      ?<span>15 oyuncu puana dahil</span>
                      :cardInfo.captainMultiplier>2
                        ?<span>Kaptan {captainMultiplier}×</span>
                        :<span>Standart kadro yapısı • 2 / 5 / 5 / 3</span>}
            </div>
          </div>
          <ManagerCardPicker
            value={managerCard}
            onChange={changeManagerCard}
            disabled={plan!=='pro'||isLocked}
            xfpByCard={plan==='pro'?managerCardPreviewXfp:{}}
            loadingCards={plan==='pro'?loadingCards:new Set()}
            compact
          />
        </div>

        <div className="roster-pitch">
          <div className="pitch-mark center-line"/>
          <div className="pitch-mark center-circle"/>
          <div className="pitch-mark box top"/>
          <div className="pitch-mark box bottom"/>

          {['GK','DEF','MID','FWD'].map(position=><div className={`roster-row roster-${position}`} key={position}>
            {Array.from({length:Math.max(effectiveSquadLimits[position],rosterByPos[position]?.length||0)},(_,slot)=>{
              const p=rosterByPos[position]?.[slot]
              if(p)return <div className="roster-player" key={p.id}>
                <button type="button" className="remove-player roster-remove" onClick={()=>remove(p.id)} aria-label="Oyuncuyu çıkar">×</button>
                <span className={`fantasy-shirt ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                <b>{displayName(p)}</b>
                <small>{p.team}</small>
                <div className="pitch-player-tags"><span>{Number(p.price||0).toFixed(1)}m</span><strong>{xfp(p).toFixed(1)} xFP</strong></div>
              </div>
              return <button type="button" className="roster-player empty-roster-slot" key={`${position}-${slot}`} onClick={()=>chooseEmptySlot(position)} disabled={isLocked}>
                <span className={`fantasy-shirt empty-shirt ${position}`}><i>+</i></span>
                <b>Oyuncu ekle</b>
                <small>{posLabel[position]}</small>
              </button>
            })}
          </div>)}
        </div>
      </section>

      <aside className="player-picker card" ref={pickerRef}>
        <div className="player-picker-head">
          <div><span className="eyebrow">OYUNCU SEÇİMİ</span><h2>Oyuncu havuzu</h2></div>
          <span>{candidates.length} oyuncu</span>
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
        {simulation?<div className={`player-simulation-panel ${simulation.error?'error':''}`}>
          <button type="button" className="simulation-close" onClick={()=>setSimulation(null)} aria-label="Simülasyonu kapat">×</button>
          {simulation.error?<p>{simulation.error}</p>:<>
            <span className="eyebrow">KADROMA GÖRE HESAPLA</span>
            <h3>{playerLabel(simulation.out)} → {playerLabel(simulation.target)}</h3>
            <div className="simulation-metrics">
              <span><small>Şimdi</small><b>{simulation.currentPlan.total.toFixed(1)}</b></span>
              <span><small>Sonra</small><b>{simulation.nextPlan.total.toFixed(1)}</b></span>
              <span className={simulation.delta>=0?'positive':'negative'}><small>Fark</small><b>{simulation.delta>=0?'+':''}{simulation.delta.toFixed(2)}</b></span>
            </div>
            <small>{simulation.nextPlan.key} • kaptan {playerLabel(simulation.nextPlan.captain)} • bütçe {simulation.nextCost.toFixed(1)}m</small>
            <button type="button" className="squad-tool-btn model-apply-btn" onClick={applySimulation}>Bu değişimi uygula</button>
          </>}
        </div>:null}
        <div className="picker-table-head">
          <span className="picker-shirt-head" aria-hidden="true"/>
          <button type="button" className={sortKey==='name'?'active':''} onClick={()=>changePoolSort('name')}>Oyuncu {sortKey==='name'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='price'?'active':''} onClick={()=>changePoolSort('price')}>Fiyat {sortKey==='price'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='xfp'?'active':''} onClick={()=>changePoolSort('xfp')}>xFP {sortKey==='xfp'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <button type="button" className={sortKey==='points'?'active':''} onClick={()=>changePoolSort('points')} title="Toplam Puan">Puan {sortKey==='points'?(sortDir==='desc'?'↓':'↑'):''}</button>
          <span className="picker-action-head" aria-hidden="true"/>
        </div>

        <div className="picker-list">
          {visibleCandidates.map(p=>{
            const chosen=ids.includes(p.id)
            const posFull=(counts[p.position]||0)>=effectiveSquadLimits[p.position]
            const teamFull=MAX_PLAYERS_PER_CLUB&&(clubCounts[p.team_id]||0)>=MAX_PLAYERS_PER_CLUB
            const overBudget=!chosen&&Number.isFinite(effectiveBudget)&&cost+Number(p.price)>effectiveBudget+.0001
            const disabled=!chosen&&(ids.length>=SQUAD_SIZE||posFull||teamFull||overBudget)
            const availabilityNote=(availabilityIsIssue(p.availability)||p.availability?.availability_type==='return')
              ? availabilityCompactNote(p.availability)
              : ''
            return <div className={`picker-player ${chosen?'chosen':''} ${disabled?'disabled':''}`} style={teamCssVars(p.team)} key={p.id}>
              <div className="picker-shirt-wrap"><span className={`fantasy-shirt tiny ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span></div>
              <div className="picker-copy">
                <b>{playerLabel(p)}</b>
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
                disabled={isLocked||disabled}
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
          <h2>{SQUAD_SIZE} kişilik kadrodan en iyi {STARTING_XI_SIZE}’i çıkar</h2>
          <p>Formasyonu seç, xFP karşılaştırmasını gör ve kaptanı belirle.</p>
        </div>
        <button type="button" className="squad-tool-btn jump-link" onClick={goToRoster}>Kadroya Dön ↑</button>
      </div>

      <div className={`manager-card-panel ${managerCard!==MANAGER_CARD_NONE?'active':''} ${plan==='pro'?'unlocked':'locked'}`}>
        <div className="manager-card-copy">
          <span className="eyebrow">GELİŞMİŞ • MENAJER KARTI</span>
          <h3>{plan==='pro'?cardInfo.label:'Menajer kartı analizi'}</h3>
          <p>{plan==='pro'?cardInfo.description:'Haftanın kartını seçerek diziliş, bütçe ve puan etkisini kadrona uygula.'}</p>
        </div>
        <div className="manager-card-effects">
          {plan!=='pro'?<span>Gelişmiş üyelikte açılır</span>:<>
            <span>Kaptan {captainMultiplier}×</span>
            {cardInfo.benchBoost?<span>15 oyuncu puana dahil</span>:null}
            {cardInfo.attack?<span>2 KL / 3 DEF / 5 OS / 5 FOR</span>:null}
            {cardInfo.unlimitedBudget?<span>Bütçe sınırı yok</span>:null}
            {managerCard===MANAGER_CARD_NONE?<span>Standart kurallar</span>:<span>MH{gameweek||'—'} için seçili</span>}
          </>}
        </div>
        <ManagerCardPicker
          value={managerCard}
          onChange={changeManagerCard}
          disabled={plan!=='pro'||isLocked}
          xfpByCard={plan==='pro'?managerCardPreviewXfp:{}}
          loadingCards={plan==='pro'?loadingCards:new Set()}
          compact
        />
      </div>

      <div className="formation-suggestions">
        {formationOptions.map(option=><button
          type="button"
          key={option.key}
          className={`formation-option ${formation===option.key?'selected':''} ${bestFormation===option.key&&option.complete?'best':''}`}
          onClick={()=>changeFormation(option.key)}
          disabled={isLocked||!option.complete}
        >
          <span>{option.key}</span>
          <b>{option.complete?option.total.toFixed(1):'—'} <small>xFP</small></b>
          <em>{bestFormation===option.key&&option.complete?'En yüksek':'Kaptan dahil'}</em>
        </button>)}
      </div>

      <div className="lineup-layout">
        <div className="lineup-field-column">
          <div className="lineup-score-strip">
            <span><small>{cardInfo.benchBoost?'Tüm takım taban xFP':'İlk 11 taban xFP'}</small><b>{scoringBase.toFixed(1)}</b></span>
            <span className="captain-total"><small>Kaptan bonusu ({captainMultiplier}×)</small><b>+{captainBonus.toFixed(1)}</b></span>
            <span className="lineup-total"><small>{managerCard===MANAGER_CARD_NONE?'İlk 11 xFP':'Kartlı hafta xFP'}</small><b>{xiCaptainTotal.toFixed(1)}</b></span>
          </div>
          <div className="squad-risk-profile">
            <span><small>Taban • P25</small><b>{riskP25.toFixed(1)}</b></span>
            <span className="expected"><small>Beklenen</small><b>{xiCaptainTotal.toFixed(1)}</b></span>
            <span><small>Tavan • P90</small><b>{riskP90.toFixed(1)}</b></span>
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
                  <button type="button" className="player-swap-hit" onClick={()=>handleSwap(p.id)} disabled={isLocked} aria-label="Yedekle değiştir">
                    <span className={`fantasy-shirt ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                    <b>{displayName(p)}</b>
                    <small>{p.team}</small>
                    <div className="pitch-player-tags"><span>{Number(p.price||0).toFixed(1)}m</span><strong>{xfp(p).toFixed(1)} xFP</strong></div>
                  </button>
                  {p.position!=='GK'?<button type="button" className={`captain-toggle ${p.id===captainId?'active':''}`} onClick={()=>setCaptainId(p.id)} disabled={isLocked} aria-label="Kaptan yap">K</button>:null}
                </div>
              })}
            </div>)}

            {xi.length<STARTING_XI_SIZE?<div className="pitch-empty-state"><b>Önce {SQUAD_SIZE} kişilik kadroyu tamamla</b><span>Üst bölümden oyuncu eklemeye devam et.</span></div>:null}
          </div>

          <div className="bench-zone lineup-bench-zone">
            <div className="bench-zone-head">
              <div><span className="eyebrow">YEDEKLER</span><b>{bench.length}/4</b></div>
              {swapTarget?<span className="swap-hint">Karşı taraftan uygun oyuncuya dokun → değiştir</span>:<span>İlk 11 veya yedekten bir oyuncuya dokunarak değişim başlat</span>}
            </div>
            <div className="my-bench-row">
              {bench.map((p,i)=>{
                const eligible=swapTarget&&swapTarget!==p.id&&Boolean(swapResult(swapTarget,p.id))
                return <button
                  type="button"
                  key={p.id}
                  className={`my-bench-player ${swapTarget===p.id?'swap-active':''} ${eligible?'eligible':''} ${swapTarget&&!eligible&&swapTarget!==p.id?'swap-disabled':''}`}
                  onClick={()=>handleSwap(p.id)}
                  disabled={isLocked}
                >
                  <span className="bench-order">{i+1}</span>
                  <span className={`fantasy-shirt mini ${p.position}`} style={teamCssVars(p.team)}><i>{shirtMark(p)}</i></span>
                  <span className="bench-copy"><b>{playerLabel(p)}</b><small>{p.team} • {posLabel[p.position]} • {xfp(p).toFixed(1)} xFP</small></span>
                </button>
              })}
            </div>
          </div>
        </div>

        <aside className="captain-panel">
          <span className="eyebrow">KAPTAN ÖNERİSİ</span>
          <h3>En güçlü 3 aday</h3>
          <p>Kaptanın puanı bu hafta {captainMultiplier}× sayılır.</p>
          <div className="captain-candidates">
            {captainCandidates.map((p,i)=><button type="button" className={p.id===captainId?'active':''} onClick={()=>setCaptainId(p.id)} disabled={isLocked} key={p.id}>
              <span>#{i+1}</span>
              <div><b>{playerLabel(p)}</b><small>{p.team}</small></div>
              <strong>{xfp(p).toFixed(1)}<small>xFP</small></strong>
            </button>)}
          </div>
          <div className="captain-impact">
            <span>Seçili kaptan</span>
            <b>{playerLabel(xi.find(p=>p.id===captainId))}</b>
            <strong>+{captainBonus.toFixed(1)} xFP</strong>
          </div>
        </aside>
      </div>

      <div className="squad-save-row">
        <div className="squad-validity">
          <div className="club-counts">{Object.entries(clubCounts).sort((a,b)=>b[1]-a[1]).map(([teamId,count])=>{const p=selected.find(x=>String(x.team_id)===String(teamId));return <span className={count>=MAX_PLAYERS_PER_CLUB?'limit':''} key={teamId}>{p?.team||teamId}: {count}/{MAX_PLAYERS_PER_CLUB}</span>})}</div>
          <span className={validRoster?'ok':''}>{validRoster?'✓':'○'} {effectiveSquadLimits.GK} KL / {effectiveSquadLimits.DEF} DEF / {effectiveSquadLimits.MID} OS / {effectiveSquadLimits.FWD} FOR</span>
          <span className={budgetOk?'ok':''}>{budgetOk?'✓':'○'} {cardInfo.unlimitedBudget?'Bütçe sınırı kaldırıldı':'Bütçe limiti'}</span>
          <span className={clubLimitOk?'ok':''}>{clubLimitOk?'✓':'○'} Kulüp başına en fazla {MAX_PLAYERS_PER_CLUB}</span>
          <span className={validXI?'ok':''}>{validXI?'✓':'○'} {liveFormation===formation?'Seçili diziliş hazır':'İlk 11 dizilişi güncellenmeli'}</span>
        </div>
        <form action={saveAction} className="squad-save-form">
          <input type="hidden" name="player_ids" value={JSON.stringify(ids)}/>
          <input type="hidden" name="squad_state" value={JSON.stringify(savePayload)}/>
          <input type="hidden" name="squad_signature" value={currentSignature}/>
          <input type="hidden" name="manager_card" value={managerCard}/>
          {saveState?.error?<small className="save-squad-error">{saveState.error}</small>:null}
          <button className="cta save-squad-btn" disabled={isLocked||!valid||!hasChanges||isSaving}>
            {isSaving?'Kaydediliyor…':hasChanges?'Takımı Kaydet':'Kaydedildi'}
          </button>
        </form>
      </div>
    </section>

    <section className="card squad-insight-bar">
      <div className="squad-model-guidance">
        <span className="eyebrow">MODEL ÖNERİSİ</span>
        {managerCard!==MANAGER_CARD_NONE?<>
          <h2>{cardInfo.label} aktif</h2>
          <p>Seçili kartın kuralları kadro ve puan hesabına uygulanıyor. Üstteki <b>Otomatik Doldur</b> ile bu karta göre optimize edilmiş kadroyu tek dokunuşla kurabilirsin.</p>
          <a className="squad-tool-btn model-apply-btn" href="/squads">Kartlı önerileri karşılaştır</a>
        </>:!recommendedIds.length?<>
          <h2>Model kadrosu henüz hazır değil</h2>
          <p>Bu haftanın önerilen kadrosu yayınlandığında mevcut kadronla burada karşılaştırılacak.</p>
        </>:ids.length!==SQUAD_SIZE?<>
          <h2>Önce 15 kişilik kadronu tamamla</h2>
          <p>Model karşılaştırması, geçerli bir 15 kişilik kadro oluştuğunda devreye girer.</p>
        </>:recommendedRosterMatch&&recommendedLineupMatch?<>
          <h2>Model kadrosuyla birebir eşleşiyorsun</h2>
          <p>15 oyuncu, ilk 11 ve kaptan modelin önerdiği düzenle aynı. Bu yüzden ayrıca transfer önermiyorum.</p>
          <span className="model-match-chip">✓ Önerilen kadro aktif</span>
        </>:recommendedRosterMatch?<>
          <h2>15'li kadron model önerisiyle aynı</h2>
          <p>Oyuncu değişikliğine gerek yok. Sadece ilk 11 veya kaptan yerleşimin model düzeninden farklı.</p>
          <button type="button" className="squad-tool-btn model-apply-btn" onClick={fillRecommended} disabled={isLocked}>Model dizilişini uygula</button>
        </>:modelMove&&modelMove.netGain>0?<>
          <h2>{playerLabel(modelMove.out)} → {playerLabel(modelMove.inn)}</h2>
          <p>Bu değişim modelin yayınlanmış önerilen kadrosuna yaklaştırır ve yaklaşık <b>+{modelMove.netGain.toFixed(2)} net xFP</b>{modelMove.hitCost?` (${modelMove.hitCost} puan transfer cezası sonrası)`:''} sağlar.</p>
          <button type="button" className="squad-tool-btn model-apply-btn" onClick={applyModelMove} disabled={isLocked}>Öneriyi Uygula</button>
        </>:<>
          <h2>Kadron model önerisine yakın</h2>
          <p>Model kadrosuna geçişte şu an tek transferle pozitif net xFP yok. Sırf eşleşmek için ceza puanlı transfer önermiyorum.</p>
        </>}
      </div>
)}</div>:<small>{plan==='pro'?'Mevcut kadro, güncel xFP ve sonraki iki fikstür gücüyle anlamlı tek-transfer fırsatı aranıyor.':'3 haftalık fikstür ayarlı transfer fırsatları ve transfer cezası analizi.'}</small>}
        {plan==='pro'?<small className="transfer-plan-note">Plan skoru gelecekteki kesin xFP değildir; mevcut xFP, rakip sezon xG/xGA gücü ve saha avantajıyla ayarlanır.</small>:null}
      </div>
    </section>
  </div>
}
