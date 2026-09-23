'use client'
import { useMemo, useState } from 'react'
import { saveSquad } from '@/app/actions'

const LIMITS={GK:2,DEF:5,MID:5,FWD:3}
export default function SquadBuilder({ players, initialIds=[], recommendedIds=[], plan='free' }){
  const [ids,setIds]=useState(initialIds),[q,setQ]=useState(''),[pos,setPos]=useState('')
  const map=useMemo(()=>new Map(players.map(p=>[p.id,p])),[players])
  const selected=ids.map(id=>map.get(id)).filter(Boolean)
  const counts=selected.reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const cost=selected.reduce((s,p)=>s+Number(p.price||0),0), bank=100-cost
  const valid=ids.length===15&&Object.entries(LIMITS).every(([k,v])=>(counts[k]||0)===v)&&cost<=100.0001
  const candidates=players.filter(p=>!ids.includes(p.id)&&(!pos||p.position===pos)&&(!q||(`${p.full_name} ${p.team}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))).slice(0,100)
  const bestMove=useMemo(()=>{
    let best=null
    for(const out of selected){
      for(const inn of players){
        if(ids.includes(inn.id)||inn.position!==out.position)continue
        if(Number(inn.price)>Number(out.price)+bank+0.001)continue
        const gain=Number(inn.projection?.xfp||0)-Number(out.projection?.xfp||0)
        if(!best||gain>best.gain)best={out,inn,gain}
      }
    }
    return best
  },[selected,players,ids,bank])
  function add(id){const p=map.get(id);if(!p||ids.includes(id))return;if(ids.length>=15)return;if((counts[p.position]||0)>=LIMITS[p.position])return;if(cost+Number(p.price)>100.0001)return;setIds([...ids,id])}
  function remove(id){setIds(ids.filter(x=>x!==id))}
  function fillRecommended(){setIds(recommendedIds.slice(0,15))}
  return <div className="squad-layout">
    <section className="card panel">
      <div className="panel-head"><div><span className="eyebrow">KADRO EDİTÖRÜ</span><h2>15 kişilik takımın</h2></div><div className="budget"><b>{cost.toFixed(1)}m</b><span>{bank.toFixed(1)}m banka</span></div></div>
      <div className="position-counts">{Object.entries(LIMITS).map(([k,v])=><span key={k} className={(counts[k]||0)===v?'ok':''}>{k} {counts[k]||0}/{v}</span>)}</div>
      <div className="selected-list">{selected.length?selected.map(p=><button key={p.id} className="selected-player" onClick={()=>remove(p.id)}><span className={`pos ${p.position}`}>{p.position}</span><b>{p.full_name}</b><small>{p.team} • {Number(p.price).toFixed(1)}m • {Number(p.projection?.xfp||0).toFixed(2)} xFP</small><i>×</i></button>):<div className="empty">Oyuncu ekle veya model kadrosunu yükle.</div>}</div>
      <div className="builder-actions"><button type="button" className="secondary" onClick={fillRecommended}>Önerilen kadroyu yükle</button><form action={saveSquad}><input type="hidden" name="player_ids" value={JSON.stringify(ids)}/><button className="cta" disabled={!valid}>Kadroyu kaydet</button></form></div>
    </section>
    <section className="card panel">
      <span className="eyebrow">OYUNCU EKLE</span><div className="filters"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ara..."/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="">Tümü</option>{Object.keys(LIMITS).map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="candidate-list">{candidates.map(p=><button key={p.id} onClick={()=>add(p.id)} disabled={(counts[p.position]||0)>=LIMITS[p.position]||cost+Number(p.price)>100.0001}><span><b>{p.full_name}</b><small>{p.team} • {Number(p.price).toFixed(1)}m</small></span><strong>{Number(p.projection?.xfp||0).toFixed(2)}</strong></button>)}</div>
    </section>
    <section className="card panel wide insight-card"><div><span className="eyebrow">MODEL ÖNERİSİ</span><h2>{bestMove&&bestMove.gain>0?`${bestMove.out.full_name} → ${bestMove.inn.full_name}`:'Kadron şu an dengeli görünüyor'}</h2>{bestMove&&bestMove.gain>0?<p>Tek transferde yaklaşık <b>+{bestMove.gain.toFixed(2)} xFP</b>. Yeni banka: {(bank+Number(bestMove.out.price)-Number(bestMove.inn.price)).toFixed(1)}m.</p>:<p>Mevcut xFP'ye göre pozitif tek transfer bulunamadı.</p>}</div><div className={`pro-lock ${plan==='pro'?'unlocked':''}`}><span>PRO</span><b>3 GW Planlayıcı</b><small>{plan==='pro'?'Pro erişimin aktif.':'Çok haftalı transfer zinciri ve risk simülasyonu.'}</small></div></section>
  </div>
}
