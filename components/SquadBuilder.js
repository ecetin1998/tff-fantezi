'use client'
import { useMemo, useState } from 'react'
import { saveSquad } from '@/app/actions'
import { teamCssVars } from '@/lib/teamThemes'

const LIMITS={GK:2,DEF:5,MID:5,FWD:3}
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
function shortName(name=''){
  const parts=String(name).trim().split(/\s+/)
  if(parts.length===1)return parts[0]
  const last=parts.at(-1)
  if(last.length<=3&&parts.length>2)return parts.at(-2)
  return last
}
function teamCode(team=''){
  return String(team).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'').slice(0,3).toLocaleUpperCase('tr')
}
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
  const [captainId,setCaptainId]=useState(()=>{
    const saved=initialState.find(x=>x.is_captain)?.player_id
    return saved&&initialXI.includes(saved)?saved:(initialXI.map(id=>map.get(id)).sort((a,b)=>xfp(b)-xfp(a))[0]?.id||null)
  })
  const [q,setQ]=useState('')
  const [pos,setPos]=useState('')
  const [team,setTeam]=useState('')
  const [sort,setSort]=useState('xfp')
  const [swapTarget,setSwapTarget]=useState(null)

  const selected=ids.map(id=>map.get(id)).filter(Boolean)
  const counts=selected.reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const cost=selected.reduce((s,p)=>s+Number(p.price||0),0)
  const bank=100-cost
  const validRoster=ids.length===15&&Object.entries(LIMITS).every(([k,v])=>(counts[k]||0)===v)&&cost<=100.0001
  const validXI=xiIds.length===11&&xiIds.every(id=>ids.includes(id))
  const valid=validRoster&&validXI&&Boolean(captainId)&&xiIds.includes(captainId)

  const xi=xiIds.map(id=>map.get(id)).filter(Boolean)
  const bench=selected.filter(p=>!xiIds.includes(p.id)).sort((a,b)=>{
    if(a.position==='GK'&&b.position!=='GK')return -1
    if(b.position==='GK'&&a.position!=='GK')return 1
    return xfp(b)-xfp(a)
  })
  const xiTotal=xi.reduce((s,p)=>s+xfp(p),0)
  const selectedTotal=selected.reduce((s,p)=>s+xfp(p),0)

  const teams=useMemo(()=>[...new Set(players.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr')),[players])
  const candidates=useMemo(()=>{
    let out=players.filter(p=>
      (!pos||p.position===pos)&&
      (!team||p.team===team)&&
      (!q||(`${p.full_name} ${p.team} ${p.projection?.opponent_name||''}`).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')))
    )
    out=[...out].sort((a,b)=>{
      if(sort==='price')return Number(a.price||0)-Number(b.price||0)
      if(sort==='minutes')return Number(b.projection?.x_minutes||0)-Number(a.projection?.x_minutes||0)
      return xfp(b)-xfp(a)
    })
    return out.slice(0,180)
  },[players,pos,team,q,sort])

  const bestMove=useMemo(()=>{
    let best=null
    for(const out of selected){
      for(const inn of players){
        if(ids.includes(inn.id)||inn.position!==out.position)continue
        if(Number(inn.price)>Number(out.price)+bank+0.001)continue
        const gain=xfp(inn)-xfp(out)
        if(!best||gain>best.gain)best={out,inn,gain}
      }
    }
    return best
  },[selected,players,ids,bank])

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
    setFormation(next)
    const nextXI=buildXI(ids,next,map)
    setXiIds(nextXI)
    const cap=nextXI.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
    if(!nextXI.includes(captainId))setCaptainId(cap?.id||null)
  }
  function autoXI(){
    const nextXI=buildXI(ids,formation,map)
    setXiIds(nextXI)
    const cap=nextXI.map(id=>map.get(id)).filter(Boolean).sort((a,b)=>xfp(b)-xfp(a))[0]
    setCaptainId(cap?.id||null)
    setSwapTarget(null)
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
  function swapWithBench(benchId){
    if(!swapTarget)return
    const a=map.get(swapTarget),b=map.get(benchId)
    if(!a||!b||a.position!==b.position)return
    setXiIds(xiIds.map(id=>id===swapTarget?benchId:id))
    if(captainId===swapTarget)setCaptainId(benchId)
    setSwapTarget(null)
  }

  const benchPayload=bench.map((p,i)=>({player_id:p.id,is_captain:false,bench_order:i+1}))
  const xiPayload=xi.map(p=>({player_id:p.id,is_captain:p.id===captainId,bench_order:null}))
  const savePayload=[...xiPayload,...benchPayload]

  return <div className="my-squad-shell">
    <section className="squad-control-strip card">
      <div className="squad-control-stat">
        <span>Seçilen oyuncular</span>
        <b>{ids.length}<small>/15</small></b>
        <i><em style={{width:`${Math.min(100,ids.length/15*100)}%`}}/></i>
      </div>
      <div className="squad-control-stat">
        <span>Bütçe</span>
        <b>{cost.toFixed(1)}<small>m / 100m</small></b>
        <small>{bank.toFixed(1)}m banka</small>
      </div>
      <label className="squad-formation-control">
        <span>Diziliş</span>
        <select value={formation} onChange={e=>changeFormation(e.target.value)}>
          {Object.keys(FORMATIONS).map(f=><option key={f}>{f}</option>)}
        </select>
      </label>
      <div className="squad-control-stat">
        <span>İlk 11 xFP</span>
        <b>{xiTotal.toFixed(1)}</b>
        <small>Toplam kadro {selectedTotal.toFixed(1)}</small>
      </div>
      <div className="squad-toolbar">
        <button type="button" className="squad-tool-btn" onClick={autoXI} disabled={!ids.length}>✦ Otomatik XI</button>
        <button type="button" className="squad-tool-btn" onClick={fillRecommended}>Model kadrosu</button>
        <button type="button" className="squad-tool-btn danger" onClick={reset}>Sıfırla</button>
      </div>
    </section>

    <div className="my-squad-layout">
      <section className="squad-stage card">
        <div className="squad-stage-head">
          <div>
            <span className="eyebrow">GW{gameweek||'—'} • {formation}</span>
            <h2>İlk 11</h2>
          </div>
          <div className="squad-stage-legend">
            <span><i className="legend-c"/> Kaptan</span>
            <span><i className="legend-swap"/> Swap modu</span>
          </div>
        </div>

        <div className="my-squad-pitch">
          <div className="pitch-mark center-line"/>
          <div className="pitch-mark center-circle"/>
          <div className="pitch-mark box top"/>
          <div className="pitch-mark box bottom"/>

          {['GK','DEF','MID','FWD'].map(position=><div className={`my-pitch-row row-${position}`} key={position}>
            {xi.filter(p=>p.position===position).map(p=><div
              key={p.id}
              className={`my-pitch-player ${swapTarget===p.id?'swap-active':''}`}
            >
              <button type="button" className="remove-player" onClick={()=>remove(p.id)} aria-label="Oyuncuyu çıkar">×</button>
              <button type="button" className="player-swap-hit" onClick={()=>setSwapTarget(swapTarget===p.id?null:p.id)} aria-label="Yedekle değiştir">
                <span className={`fantasy-shirt ${p.position}`} style={teamCssVars(p.team)}><i>{teamCode(p.team)}</i></span>
                <b>{shortName(p.full_name)}</b>
                <small>{p.team}</small>
                <div className="pitch-player-tags">
                  <span>{Number(p.price||0).toFixed(1)}m</span>
                  <strong>{xfp(p).toFixed(1)} xFP</strong>
                </div>
              </button>
              <button
                type="button"
                className={`captain-toggle ${p.id===captainId?'active':''}`}
                onClick={()=>setCaptainId(p.id)}
                aria-label="Kaptan yap"
              >C</button>
            </div>)}
          </div>)}

          {xi.length<11?<div className="pitch-empty-state">
            <b>{ids.length<15?'Kadronu oluşturmaya devam et':'Formasyona uygun XI oluşturuluyor'}</b>
            <span>Sağdaki oyuncu havuzundan seçim yap.</span>
          </div>:null}
        </div>

        <div className="bench-zone">
          <div className="bench-zone-head">
            <div><span className="eyebrow">YEDEKLER</span><b>{bench.length}/4</b></div>
            {swapTarget?<span className="swap-hint">Aynı mevkideki yedeğe dokun → değiştir</span>:<span>Bir saha oyuncusuna dokunarak swap başlat</span>}
          </div>
          <div className="my-bench-row">
            {bench.map((p,i)=><button
              type="button"
              key={p.id}
              className={`my-bench-player ${swapTarget&&map.get(swapTarget)?.position===p.position?'eligible':''}`}
              onClick={()=>swapTarget?swapWithBench(p.id):null}
            >
              <span className="bench-order">{i+1}</span>
              <span className={`fantasy-shirt mini ${p.position}`} style={teamCssVars(p.team)}><i>{teamCode(p.team)}</i></span>
              <span className="bench-copy"><b>{shortName(p.full_name)}</b><small>{posLabel[p.position]} • {Number(p.price||0).toFixed(1)}m • {xfp(p).toFixed(1)} xFP</small></span>
              <i className="bench-remove" onClick={e=>{e.stopPropagation();remove(p.id)}}>×</i>
            </button>)}
            {Array.from({length:Math.max(0,4-bench.length)},(_,i)=><div className="my-bench-player empty-slot" key={'empty'+i}><span>+</span><small>Yedek</small></div>)}
          </div>
        </div>

        <div className="squad-save-row">
          <div className="squad-validity">
            <span className={validRoster?'ok':''}>{validRoster?'✓':'○'} 2 KL / 5 DEF / 5 OS / 3 FOR</span>
            <span className={cost<=100?'ok':''}>{cost<=100?'✓':'○'} Bütçe limiti</span>
            <span className={validXI?'ok':''}>{validXI?'✓':'○'} 11 saha oyuncusu</span>
          </div>
          <form action={saveSquad}>
            <input type="hidden" name="player_ids" value={JSON.stringify(ids)}/>
            <input type="hidden" name="squad_state" value={JSON.stringify(savePayload)}/>
            <button className="cta save-squad-btn" disabled={!valid}>Takımı Kaydet</button>
          </form>
        </div>
      </section>

      <aside className="player-picker card">
        <div className="player-picker-head">
          <div><span className="eyebrow">OYUNCU SEÇİMİ</span><h2>Oyuncu havuzu</h2></div>
          <span>{players.length}</span>
        </div>

        <div className="picker-filters">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu veya takım ara..."/>
          <div>
            <select value={pos} onChange={e=>setPos(e.target.value)}>
              <option value="">Tüm mevkiler</option>
              <option value="GK">Kaleci</option><option value="DEF">Defans</option><option value="MID">Orta saha</option><option value="FWD">Forvet</option>
            </select>
            <select value={team} onChange={e=>setTeam(e.target.value)}>
              <option value="">Tüm takımlar</option>{teams.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <select value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="xfp">xFP yüksek → düşük</option>
            <option value="price">Fiyat düşük → yüksek</option>
            <option value="minutes">xDakika yüksek → düşük</option>
          </select>
        </div>

        <div className="picker-list">
          {candidates.map(p=>{
            const chosen=ids.includes(p.id)
            const posFull=(counts[p.position]||0)>=LIMITS[p.position]
            const overBudget=!chosen&&cost+Number(p.price)>100.0001
            const disabled=!chosen&&(ids.length>=15||posFull||overBudget)
            return <div className={`picker-player ${chosen?'chosen':''} ${disabled?'disabled':''}`} style={teamCssVars(p.team)} key={p.id}>
              <div className="picker-shirt-wrap"><span className={`fantasy-shirt tiny ${p.position}`} style={teamCssVars(p.team)}><i>{teamCode(p.team)}</i></span></div>
              <div className="picker-copy">
                <b>{p.full_name}</b>
                <small>{p.team} • vs {p.projection?.opponent_name||'—'}</small>
                <div><span>{posLabel[p.position]}</span><span>{Number(p.price||0).toFixed(1)}m</span><span>{Number(p.projection?.x_minutes||0).toFixed(0)} dk</span></div>
              </div>
              <div className="picker-score"><b>{xfp(p).toFixed(2)}</b><small>xFP</small></div>
              <button type="button" onClick={()=>chosen?remove(p.id):add(p.id)} disabled={disabled}>{chosen?'✓':'+'}</button>
            </div>
          })}
        </div>
      </aside>
    </div>

    <section className="card squad-insight-bar">
      <div>
        <span className="eyebrow">MODEL ÖNERİSİ</span>
        <h2>{bestMove&&bestMove.gain>0?`${shortName(bestMove.out.full_name)} → ${shortName(bestMove.inn.full_name)}`:'Kadron şu an dengeli görünüyor'}</h2>
        {bestMove&&bestMove.gain>0?<p>Tek transferde yaklaşık <b>+{bestMove.gain.toFixed(2)} xFP</b> potansiyeli.</p>:<p>Mevcut xFP’ye göre pozitif tek transfer bulunamadı.</p>}
      </div>
      <div className={`pro-lock ${plan==='pro'?'unlocked':''}`}>
        <span>PRO</span><b>3 GW Planlayıcı</b><small>{plan==='pro'?'Pro erişimin aktif.':'Çok haftalı transfer zinciri ve risk simülasyonu.'}</small>
      </div>
    </section>
  </div>
}
