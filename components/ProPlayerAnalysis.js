'use client'

import {useEffect,useState} from 'react'
import AccessGate from '@/components/AccessGate'

const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)

function MetricGrid({items,className=''}) {
  return <div className={`player-detail-metric-grid ${className}`}>
    {items.map(item=><div className={item.emphasis?'is-emphasis':''} key={item.label}>
      <span>{item.label}</span><b>{item.value}</b>{item.note?<small>{item.note}</small>:null}
    </div>)}
  </div>
}

export default function ProPlayerAnalysis({playerId,isGK=false,isDEF=false,detailedRole=''}) {
  const [state,setState]=useState({status:'loading',data:null})

  useEffect(()=>{
    let alive=true
    fetch('/api/pro/player/'+playerId,{credentials:'same-origin',cache:'no-store'})
      .then(async res=>{
        if(res.status===403)return {status:'locked',data:null}
        if(!res.ok)throw new Error('pro player request failed')
        return {status:'ready',data:await res.json()}
      })
      .then(next=>{if(alive)setState(next)})
      .catch(()=>{if(alive)setState({status:'error',data:null})})
    return ()=>{alive=false}
  },[playerId])

  if(state.status==='loading')return <section className="card profile-card pro-player-loading">
    <span className="eyebrow">PRO ANALİZ</span><h2>Gelişmiş oyuncu analizi yükleniyor…</h2>
  </section>

  if(state.status==='locked')return <AccessGate
    compact
    tier="pro"
    eyebrow="PRO • OYUNCU DERİNLİĞİ"
    title="Puan dağılımı, xG/xA ve rol değişimini aç."
    description="P25/P75/P90, 6+ ihtimali, beklenen gol/asist ve son maç rol-dakika karşılaştırmaları Pro üyelikte görünür."
  />

  if(state.status==='error'||!state.data)return <section className="card profile-card pro-player-error">
    <span className="eyebrow">PRO ANALİZ</span><h2>Gelişmiş analiz şu anda yüklenemedi.</h2>
    <p className="muted">Temel oyuncu görünümünü kullanmaya devam edebilirsin.</p>
  </section>

  const {projection:p={},role:r={},season:s={},modelFeatures:mf={}}=state.data
  const scenarioMetrics=[
    {label:'Temkinli',value:num(p.p25,1),note:'alt çeyrek'},
    {label:'Beklenti',value:num(p.xfp,1),note:'ortalama senaryo',emphasis:true},
    {label:'İyi senaryo',value:num(p.p75,1),note:'üst çeyreğe giriş'},
    {label:'Tavan',value:num(p.p90,1),note:'üst %10'},
  ]
  const roleMetrics=[
    {label:'Son 2 maç XI',value:pct(r.last2_xi_probability)},
    {label:'Önceki 2 maç XI',value:pct(r.previous2_xi_probability)},
    {label:'Son 2 dakika',value:num(r.last2_minutes,1)},
    {label:'Önceki 2 dakika',value:num(r.previous2_minutes,1)},
  ]
  const advancedSeason=[
    {label:'6+ maç',value:Number(s.six_plus_count||0)},
  ]
  if(!isGK)advancedSeason.push(
    {label:'xG toplam',value:num(s.xg_total)},
    {label:'xA / 90',value:s.xa_per90===null||s.xa_per90===undefined?num(s.xa_model_per90):num(s.xa_per90),note:s.xa_per90===null||s.xa_per90===undefined?'model/prior':'gözlenen'},
    {label:'Şut',value:s.shots===null||s.shots===undefined?'—':Number(s.shots)},
    {label:'İsabetli şut',value:s.shots_on_target===null||s.shots_on_target===undefined?'—':Number(s.shots_on_target)},
    {label:'Şut payı',value:s.shot_share===null||s.shot_share===undefined?'—':pct(s.shot_share)},
    {label:'Yaratılan şans',value:s.key_passes===null||s.key_passes===undefined?'—':Number(s.key_passes)},
    {label:'Şans yaratma payı',value:s.chance_creation_share===null||s.chance_creation_share===undefined?'—':pct(s.chance_creation_share)},
    {label:'Takım hücum katkısı',value:s.attack_contribution_share===null||s.attack_contribution_share===undefined?'—':pct(s.attack_contribution_share)}
  )

  return <>
    <div className="profile-grid player-profile-main-grid">
      <section className="card profile-card player-scenario-card">
        <div className="player-detail-section-head"><div><span className="eyebrow">PRO • PUAN ARALIĞI</span><h2>Olası sonuç dağılımı</h2></div></div>
        <p className="projection-explainer">Tek bir puana takılmak yerine olası sonuç aralığını birlikte oku.</p>
        <MetricGrid items={scenarioMetrics} className="scenario-metrics"/>
        {!isGK?<div className="player-attacking-expectation">
          <div><span>Beklenen gol</span><b>{num(p.expected_goals)}</b></div>
          <div><span>Beklenen asist</span><b>{num(p.expected_assists)}</b></div>
        </div>:null}
      </section>
      <section className="card profile-card player-role-card">
        <div className="player-detail-section-head"><div><span className="eyebrow">PRO • ROL & DAKİKA</span><h2>{r.signal||'Rol sinyali yok'}</h2></div></div>
        <MetricGrid items={roleMetrics} className="role-metrics"/>
        <p className="player-role-caption">Son maçlardaki kullanım ile önceki dönemi yan yana gösterir.</p>
      </section>
    </div>

    <section className="card profile-card player-pro-season-card">
      <div className="panel-head"><div><span className="eyebrow">PRO • İLERİ SEZON VERİSİ</span><h2>Üretim ve tavan sinyalleri</h2></div></div>
      <MetricGrid items={advancedSeason} className="season-position-metrics"/>
    </section>

    <details className="card profile-card player-advanced-details">
      <summary><span><small>PRO • İLERİ MODEL DETAYLARI</small><b>Teknik detayları göster</b></span><i>+</i></summary>
      <div className="player-advanced-body">
        <div className="detail-list">
          <div><span>6+ puan ihtimali</span><b>{pct(p.six_plus_probability)}</b></div>
          <div><span>Oynama olasılığı</span><b>{pct(p.appearance_probability)}</b></div>
          <div><span>60+ dakika</span><b>{pct(p.over60_probability)}</b></div>
          <div><span>Temel xFP</span><b>{num(p.core_xfp)}</b></div>
          <div><span>Beklenen bonus</span><b>{num(p.x_bonus)}</b></div>
          <div><span>Top-25 sıra</span><b>{p.top25_rank?'#'+p.top25_rank:'—'}</b></div>
          <div><span>Top-25 skor</span><b>{p.top25_score===null||p.top25_score===undefined?'—':num(p.top25_score,3)}</b></div>
          {!isGK?<div><span>Takım gol payı</span><b>{pct(r.team_goal_share)}</b></div>:null}
          {!isGK?<div><span>Model xA / 90</span><b>{mf.effective_xa_per90===null||mf.effective_xa_per90===undefined?'—':num(mf.effective_xa_per90,3)}</b></div>:null}
          {detailedRole?<div><span>Detay rol</span><b>{detailedRole}</b></div>:null}
          {isDEF?<div><span>Defans tavan okuması</span><b>Hücum + CS birlikte</b></div>:null}
        </div>
      </div>
    </details>
  </>
}
