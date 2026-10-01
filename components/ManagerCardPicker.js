'use client'

import {MANAGER_CARDS,MANAGER_CARD_NONE} from '@/lib/managerCards'

export default function ManagerCardPicker({
  value=MANAGER_CARD_NONE,
  onChange,
  disabled=false,
  xfpByCard={},
  loadingCards=new Set(),
  compact=false,
}){
  return <div className={`manager-card-buttons ${compact?'compact':''}`} role="group" aria-label="Menajer kartı seçimi">
    {MANAGER_CARDS.map(card=>{
      const active=value===card.id
      const xfp=xfpByCard?.[card.id]
      const loading=loadingCards?.has?.(card.id)
      const hasXfp=xfp!==null&&xfp!==undefined&&Number.isFinite(Number(xfp))
      return <button
        type="button"
        key={card.id}
        className={`manager-card-choice ${active?'selected':''}`}
        onClick={()=>onChange?.(card.id)}
        disabled={disabled}
        aria-pressed={active}
      >
        <span>{card.shortLabel}</span>
        <b>{loading?'Hesaplanıyor…':hasXfp?`${Number(xfp).toFixed(1)} xFP`:card.id===MANAGER_CARD_NONE?'Standart':card.id==='attack'?'Kadro değişmeli':'Kadro tamamlanmalı'}</b>
        <small>{card.id==='attack'?'105m • 2 KL / 3 DEF / 5 OS / 5 FOR':card.captainMultiplier>2?`Kaptan ${card.captainMultiplier}×`:card.benchBoost?'15 oyuncu puanda':card.unlimitedBudget?'Bütçe sınırı yok':'Normal kurallar'}</small>
      </button>
    })}
  </div>
}
