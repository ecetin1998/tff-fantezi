'use client'

import {useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import SquadPitchView from '@/components/SquadPitchView'
import ManagerCardPicker from '@/components/ManagerCardPicker'
import {MANAGER_CARDS,MANAGER_CARD_NONE,managerCardInfo,normalizeManagerCard} from '@/lib/managerCards'

function cardXfp(data){
  const value=data?.recommendation?.xi_xfp_with_card??data?.recommendation?.captain_xfp??data?.recommendation?.xi_xfp
  if(value===null||value===undefined)return null
  const n=Number(value)
  return Number.isFinite(n)?n:null
}

function SquadCard({data,title,variant,cardActive=false,loading=false}){
  if(loading)return <section className="card unified-squad-card"><div className="manager-card-loading">Seçilen kart için kadro hazırlanıyor…</div></section>
  if(!data?.members?.length)return <section className="card unified-squad-card"><div className="manager-card-error">Bu kart için kadro üretilemedi.</div></section>
  return <section className="card unified-squad-card">
    <SquadPitchView
      members={data.members}
      title={title}
      gameweek={data.run?.gameweek}
      budget={data.recommendation?.budget}
      xiXfp={cardXfp(data)}
      variant={variant}
      scoreLabel={cardActive?'Kartlı hafta xFP':'İlk 11 xFP'}
      budgetLimit={data.recommendation?.budget_limit??100}
      unlimitedBudget={Boolean(data.recommendation?.unlimited_budget)}
      showBench
    />
  </section>
}

export default function ManagerCardRecommendations({baseRecommended,baseAlternative}){
  const [managerCard,setManagerCard]=useState(MANAGER_CARD_NONE)
  const [cache,setCache]=useState(()=>({[MANAGER_CARD_NONE]:{recommended:baseRecommended,alternative:baseAlternative}}))
  const [loadingCards,setLoadingCards]=useState(()=>new Set())
  const [loadingSelected,setLoadingSelected]=useState(false)
  const [error,setError]=useState('')
  const cardInfo=useMemo(()=>managerCardInfo(managerCard),[managerCard])

  useEffect(()=>{
    let cancelled=false
    async function preload(){
      const supabase=createClient()
      const cards=MANAGER_CARDS.filter(card=>card.id!==MANAGER_CARD_NONE)
      setLoadingCards(new Set(cards.map(card=>card.id)))
      await Promise.all(cards.map(async card=>{
        try{
          const {data,error}=await supabase.functions.invoke('manager-card-recommendation',{body:{card:card.id,variant:'recommended'}})
          if(error||data?.error)throw error||new Error(data.error)
          if(!cancelled)setCache(current=>({...current,[card.id]:{...(current[card.id]||{}),recommended:data}}))
        }catch{
          // Bir kartın önizlemesi başarısız olsa bile diğer kartlar kullanılabilir kalsın.
        }finally{
          if(!cancelled)setLoadingCards(current=>{
            const next=new Set(current);next.delete(card.id);return next
          })
        }
      }))
    }
    preload()
    return ()=>{cancelled=true}
  },[])

  async function loadCard(value){
    const next=normalizeManagerCard(value)
    setManagerCard(next)
    setError('')
    if(next===MANAGER_CARD_NONE||cache[next]?.alternative)return
    setLoadingSelected(true)
    try{
      const supabase=createClient()
      const requests=[]
      if(!cache[next]?.recommended)requests.push(
        supabase.functions.invoke('manager-card-recommendation',{body:{card:next,variant:'recommended'}})
          .then(result=>({kind:'recommended',...result}))
      )
      requests.push(
        supabase.functions.invoke('manager-card-recommendation',{body:{card:next,variant:'alternative'}})
          .then(result=>({kind:'alternative',...result}))
      )
      const results=await Promise.all(requests)
      const patch={}
      for(const result of results){
        if(result.error)throw result.error
        if(result.data?.error)throw new Error(result.data.error)
        patch[result.kind]=result.data
      }
      setCache(current=>({...current,[next]:{...(current[next]||{}),...patch}}))
    }catch(err){
      setError(String(err?.message||'Menajer kartı kadrosu hazırlanamadı.'))
    }finally{
      setLoadingSelected(false)
    }
  }

  const previewXfp=useMemo(()=>Object.fromEntries(
    MANAGER_CARDS.map(card=>[card.id,cardXfp(cache[card.id]?.recommended)])
  ),[cache])

  const active=cache[managerCard]||cache[MANAGER_CARD_NONE]
  const baseXfp=cardXfp(cache[MANAGER_CARD_NONE]?.recommended)
  const bestWeeklyCard=MANAGER_CARDS
    .filter(card=>card.id!==MANAGER_CARD_NONE)
    .map(card=>({card,xfp:cardXfp(cache[card.id]?.recommended)}))
    .filter(row=>row.xfp!==null&&baseXfp!==null)
    .map(row=>({...row,delta:Number(row.xfp)-Number(baseXfp)}))
    .sort((a,b)=>b.delta-a.delta)[0]||null
  return <>
    <div className={`manager-card-panel unlocked ${managerCard!==MANAGER_CARD_NONE?'active':''}`}>
      <div className="manager-card-copy">
        <span className="eyebrow">GELİŞMİŞ • MENAJER KARTI</span>
        <h3>Kart etkisini xFP ile karşılaştır</h3>
        <p>Kartları taktik seçer gibi karşılaştır. Butondaki xFP, o kartla modelin Önerilen Kadro için hesapladığı haftalık değerdir.</p>
      </div>
      <div className="manager-card-effects">
        <span>{cardInfo.label}</span>
        <span>Kaptan {cardInfo.captainMultiplier}×</span>
        {cardInfo.benchBoost?<span>15 oyuncu puana dahil</span>:null}
        {cardInfo.attack?<span>2 KL / 3 DEF / 5 OS / 5 FOR</span>:null}
        {cardInfo.unlimitedBudget?<span>Bütçe sınırı yok</span>:null}
      </div>
      {bestWeeklyCard?<div className="manager-card-weekly-read">
        <span>BU HAFTAKİ MODEL FARKI</span>
        <b>{bestWeeklyCard.card.shortLabel} <em>{bestWeeklyCard.delta>=0?'+':''}{bestWeeklyCard.delta.toFixed(1)} xFP</em></b>
        <small>Yalnız MH{active?.run?.gameweek||baseRecommended?.run?.gameweek||'—'} etkisi; kartı sezon içinde hangi hafta kullanmanın daha değerli olacağı ayrıca değerlendirilmelidir.</small>
      </div>:null}
      <ManagerCardPicker
        value={managerCard}
        onChange={loadCard}
        xfpByCard={previewXfp}
        loadingCards={loadingCards}
      />
    </div>
    {loadingSelected?<div className="manager-card-loading">Seçilen kart için Agresif 11 hazırlanıyor…</div>:null}
    {error?<div className="manager-card-error">{error}</div>:null}
    <div className="unified-squad-list">
      <SquadCard data={active?.recommended} title={managerCard===MANAGER_CARD_NONE?'ÖNERİLEN KADRO':`ÖNERİLEN • ${cardInfo.shortLabel}`} variant="recommended" cardActive={managerCard!==MANAGER_CARD_NONE}/>
      <SquadCard data={active?.alternative} title={managerCard===MANAGER_CARD_NONE?'AGRESİF 11':`AGRESİF • ${cardInfo.shortLabel}`} variant="alternative" cardActive={managerCard!==MANAGER_CARD_NONE} loading={managerCard!==MANAGER_CARD_NONE&&loadingSelected&&!active?.alternative}/>
    </div>
  </>
}
