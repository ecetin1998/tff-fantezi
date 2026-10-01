'use client'

import {useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import SquadPitchView from '@/components/SquadPitchView'
import {MANAGER_CARDS,MANAGER_CARD_NONE,managerCardInfo,normalizeManagerCard} from '@/lib/managerCards'

function SquadCard({data,title,variant,cardActive=false}){
  if(!data?.members?.length)return <section className="card unified-squad-card"><div className="manager-card-error">Bu kart için kadro üretilemedi.</div></section>
  return <section className="card unified-squad-card">
    <SquadPitchView
      members={data.members}
      title={title}
      gameweek={data.run?.gameweek}
      budget={data.recommendation?.budget}
      xiXfp={data.recommendation?.xi_xfp_with_card??data.recommendation?.captain_xfp??data.recommendation?.xi_xfp}
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
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const selected=cache[managerCard]||cache[MANAGER_CARD_NONE]
  const cardInfo=useMemo(()=>managerCardInfo(managerCard),[managerCard])

  async function loadCard(value){
    const next=normalizeManagerCard(value)
    setManagerCard(next)
    setError('')
    if(cache[next]||next===MANAGER_CARD_NONE)return
    setLoading(true)
    try{
      const supabase=createClient()
      const [recommended,alternative]=await Promise.all([
        supabase.functions.invoke('manager-card-recommendation',{body:{card:next,variant:'recommended'}}),
        supabase.functions.invoke('manager-card-recommendation',{body:{card:next,variant:'alternative'}}),
      ])
      if(recommended.error)throw recommended.error
      if(alternative.error)throw alternative.error
      if(recommended.data?.error)throw new Error(recommended.data.error)
      if(alternative.data?.error)throw new Error(alternative.data.error)
      setCache(current=>({...current,[next]:{recommended:recommended.data,alternative:alternative.data}}))
    }catch(err){
      setError(String(err?.message||'Menajer kartı kadrosu hazırlanamadı.'))
      setManagerCard(MANAGER_CARD_NONE)
    }finally{
      setLoading(false)
    }
  }

  const active=cache[managerCard]||selected
  return <>
    <div className={`manager-card-panel unlocked ${managerCard!==MANAGER_CARD_NONE?'active':''}`}>
      <div className="manager-card-copy">
        <span className="eyebrow">GELİŞMİŞ • MENAJER KARTI</span>
        <h3>{cardInfo.label}</h3>
        <p>{cardInfo.description} Kart değiştiğinde iki kadro da bu haftanın kuralına göre yeniden hesaplanır.</p>
      </div>
      <label className="manager-card-select">
        <span>Bu hafta</span>
        <select value={managerCard} onChange={e=>loadCard(e.target.value)} disabled={loading}>
          {MANAGER_CARDS.map(card=><option value={card.id} key={card.id}>{card.label}</option>)}
        </select>
      </label>
      <div className="manager-card-effects">
        <span>Kaptan {cardInfo.captainMultiplier}×</span>
        {cardInfo.benchBoost?<span>15 oyuncu puana dahil</span>:null}
        {cardInfo.attack?<span>2-5-3 • 105m bütçe</span>:null}
        {cardInfo.unlimitedBudget?<span>Bütçe sınırı yok</span>:null}
        {managerCard===MANAGER_CARD_NONE?<span>Standart kurallar</span>:<span>Kartlı optimizasyon</span>}
      </div>
    </div>
    {loading?<div className="manager-card-loading">Kart etkisine göre Önerilen ve Agresif kadro yeniden hesaplanıyor…</div>:null}
    {error?<div className="manager-card-error">{error}</div>:null}
    <div className="unified-squad-list">
      <SquadCard data={active?.recommended} title={managerCard===MANAGER_CARD_NONE?'ÖNERİLEN KADRO':`ÖNERİLEN • ${cardInfo.shortLabel}`} variant="recommended" cardActive={managerCard!==MANAGER_CARD_NONE}/>
      <SquadCard data={active?.alternative} title={managerCard===MANAGER_CARD_NONE?'AGRESİF 11':`AGRESİF • ${cardInfo.shortLabel}`} variant="alternative" cardActive={managerCard!==MANAGER_CARD_NONE}/>
    </div>
  </>
}
