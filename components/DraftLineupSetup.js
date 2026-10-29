'use client'
import {useEffect,useMemo,useState,useCallback} from 'react'
import {createClient} from '@/lib/supabase/client'
import {FORMATION_MAP} from '@/lib/rules'
import {MANAGER_CARDS} from '@/lib/managerCards'
import {draftFormationOptions,draftProjectedPoints} from '@/lib/draftLineupForecast'
import s from './DraftLineupSetup.module.css'

const positions={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}
const offered=MANAGER_CARDS
const supportedCards=new Set(['none','triple_captain','quad_captain','bench_boost'])
const formatXfp=value=>Number(value||0).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1})
const xfp=p=>Number(p.xfp||0)
function initialFormation(players){
 const best=draftFormationOptions(players,FORMATION_MAP)[0]
 return best?{starters:best.starters,bench:best.bench,captain:best.captain,card:'none'}
  :{starters:[],bench:[],captain:0,card:'none'}
}

export default function DraftLineupSetup({roomId,picks=[],pool=[],myTeamId,onLeagueActive}){
 const client=useMemo(()=>createClient(),[])
 const [status,setStatus]=useState(null)
 const [error,setError]=useState('')
 const [info,setInfo]=useState('')
 const [loading,setLoading]=useState(false)
 const [weekLoaded,setWeekLoaded]=useState(null)
 const [starters,setStarters]=useState([])
 const [bench,setBench]=useState([])
 const [captain,setCaptain]=useState(0)
 const [card,setCard]=useState('none')
 const [selected,setSelected]=useState(null)
 const [dirty,setDirty]=useState(false)
 const roster=useMemo(()=>{
  const byId=new Map(pool.map(p=>[Number(p.id),p]))
  return picks.filter(p=>p.team_id===myTeamId).map(p=>({
   ...byId.get(Number(p.player_id)),
   id:Number(p.player_id),name:byId.get(Number(p.player_id))?.name||p.player_name,
   position:p.position,xfp:Number(p.xfp||0)
  }))
 },[picks,pool,myTeamId])
 const playerById=useMemo(()=>new Map(roster.map(p=>[p.id,p])),[roster])
 const formationOptions=useMemo(()=>draftFormationOptions(roster,FORMATION_MAP),[roster])
 const refresh=useCallback(async()=>{
  const {data,error:rpcError}=await client.rpc('scout_draft_lineup_state',{p_room_id:roomId})
  if(rpcError)throw rpcError
  setStatus(data)
  if(data?.league_active)onLeagueActive?.()
  return data
 },[client,roomId,onLeagueActive])
 useEffect(()=>{
  let alive=true
  const tick=async()=>{try{if(alive)await refresh()}catch(e){if(alive)setError(String(e.message||e).slice(0,140))}}
  void tick()
  const timer=setInterval(()=>{void tick()},8000)
  return()=>{alive=false;clearInterval(timer)}
 },[refresh])
 useEffect(()=>{
  if(!status||roster.length!==15||weekLoaded===status.gameweek)return
  const base=initialFormation(roster)
  const old=status.my
  const starterIds=old?.starters?.length===11?old.starters.map(Number):base.starters
  const benchIds=old?.bench?.length===4?old.bench.map(Number):base.bench
  setStarters(starterIds);setBench(benchIds)
  setCaptain(starterIds.includes(Number(old?.captain))?Number(old.captain):base.captain)
  setCard(old?.card||'none');setSelected(null);setDirty(false)
  setWeekLoaded(status.gameweek)
 },[status,roster,weekLoaded])
 const formation=useMemo(()=>{
  const counts={GK:0,DEF:0,MID:0,FWD:0}
  starters.forEach(id=>{const p=playerById.get(id);if(p)counts[p.position]++})
  return {label:counts.DEF+'-'+counts.MID+'-'+counts.FWD,
   valid:counts.GK===1&&Boolean(FORMATION_MAP[counts.DEF+'-'+counts.MID+'-'+counts.FWD])}
 },[starters,playerById])
 const allIds=[...starters,...bench]
 const valid=roster.length===15&&starters.length===11&&bench.length===4&&
  new Set(allIds).size===15&&allIds.every(id=>playerById.has(id))&&
  formation.valid&&playerById.get(bench[0])?.position==='GK'&&starters.includes(Number(captain))
 const projected=draftProjectedPoints(starters,bench,captain,card,playerById)
 const baseline=draftProjectedPoints(starters,bench,captain,'none',playerById)
 const selectFormation=option=>{
  if(locked)return
  setStarters([...option.starters])
  setBench([...option.bench])
  setCaptain(option.captain)
  setSelected(null)
  setDirty(true)
  setInfo('Bu dizilişin en yüksek tahmini puanlı ilk 11’i yerleştirildi. Futbolcuları kendin değiştirebilirsin.')
 }
 const readyCount=(status?.teams||[]).filter(t=>t.ready).length
 const teamCount=status?.teams?.length||0
 const locked=!status?.can_edit
 const choose=(id,source)=>{
  if(locked)return
  if(selected===null){setSelected({id,source});return}
  if(selected.id===id){setSelected(null);return}
  const target=source==='starter'?starters:bench
  const original=selected.source==='starter'?starters:bench
  const to=target.indexOf(id),from=original.indexOf(selected.id)
  if(to<0||from<0){setSelected(null);return}
  const nextStarters=[...starters],nextBench=[...bench]
  if(source==='starter')nextStarters[to]=selected.id
  else nextBench[to]=selected.id
  if(selected.source==='starter')nextStarters[from]=id
  else nextBench[from]=id
  setStarters(nextStarters);setBench(nextBench)
  if(!nextStarters.includes(captain))setCaptain(nextStarters.find(x=>playerById.get(x)?.position!=='GK')||nextStarters[0]||0)
  setDirty(true);setSelected(null);setInfo('')
 }
 const swapBench=(idx,step)=>{
  const j=idx+step
  if(locked||idx<1||j<1||j>3)return
  const next=[...bench];[next[idx],next[j]]=[next[j],next[idx]]
  setBench(next);setDirty(true);setSelected(null)
 }
 const save=async()=>{
  if(!status?.gameweek||!valid||locked)return
  setLoading(true);setError('');setInfo('')
  try{
   const {error:rpcError}=await client.rpc('scout_draft_save_lineup',{
    p_room_id:roomId,p_gameweek:status.gameweek,p_starters:starters,p_bench:bench,
    p_captain:Number(captain),p_manager_card:card,p_ready:true
   })
   if(rpcError)throw rpcError
   setDirty(false)
   const next=await refresh()
   setInfo(next?.league_active?'Kadro onaylandı. Lig puan takibi aktif.':'Kadro kaydedildi; diğer menajerler bekleniyor.')
  }catch(e){setError(String(e.message||e).slice(0,160))}
  finally{setLoading(false)}
 }
 const saved=Boolean(status?.my?.ready)&&!dirty
 return <section className={s.wrap} aria-label="Draft kadro oluşturma">
  <div className={s.header}>
   <div><small className={s.eyebrow}>DRAFT SONRASI · KADRO KURMA</small>
    <h2>MH{status?.gameweek||'—'} · İlk 11 ve Yedekler</h2>
    <p>15 seçili futbolcundan ilk 11'i kur; kalan dört oyuncuyu yedek sırasına yerleştir. Aynı oyuncuya iki kez yer verilemez.</p></div>
   <div className={s.readyBadge}>{status?.league_active?'Lig aktif':readyCount+'/'+teamCount+' hazır'}</div>
  </div>
  {error&&<p role="alert" className={s.error}>{error}</p>}
  {info&&<p role="status" className={s.info}>{info}</p>}
  {!status?<p className={s.info}>Kadro durumu yükleniyor…</p>:<>
   <div className={s.topline}>
    <span>Diziliş <b className={formation.valid?s.formationOk:s.formationBad}>{formation.label}</b></span>
    <span>Kadro son tarihi <b>{status.deadline_at?new Date(status.deadline_at).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Henüz belirlenmedi'}</b></span>
   </div>
   {!status.league_active&&<div className={s.readyTeams}>
    <div className={s.readySummary}><strong>Kadro onay durumu · {readyCount}/{teamCount} hazır</strong><span>Herkes onayladığında kadrolar kilitlenir ve canlı puan durumu açılır.</span></div>
    <div className={s.readyList}>{(status.teams||[]).map(t=><div className={s.readyTeam} key={t.team_id}>
     <strong>{t.is_bot?'🤖 ':''}{t.name}{t.mine?' · SEN':''}</strong>
     <span className={t.ready?s.readyDone:s.readyWaiting}>{t.ready?'✓ Hazır':'Kaydetmesi bekleniyor'}</span>
    </div>)}</div>
   </div>}
   {status.league_active&&<p className={s.explainer}>Herkes hazır. Bu tek haftalık yarışmanın kadroları kilitlendi; canlı puan tablosu açılıyor.</p>}
   {selected&&<p className={s.help}>Değiştirmek için başka bir futbolcuya dokun. Mevki dağılımı kaydetme sırasında kontrol edilir.</p>}
   <div className={s.forecastSummary}>
    <div><small>SEÇİLİ KADRO · MH{status.gameweek}</small><strong>{formatXfp(projected)} xFP</strong>
    <span>İlk 11, kaptan ve seçilen kart dahil tahmini toplam</span></div>
    <div><small>MENAJER KARTI ETKİSİ</small><strong>{projected-baseline>=0?'+':''}{formatXfp(projected-baseline)} xFP</strong>
    <span>Standart kaptan 2× puanlamasına göre fark</span></div>
   </div>
   <div className={s.config}>
    <label>Kaptan
     <select disabled={locked} value={captain} onChange={e=>{setCaptain(Number(e.target.value));setDirty(true)}}>
      {starters.map(id=><option key={id} value={id}>{playerById.get(id)?.name||'Oyuncu'}</option>)}
     </select>
     <small className={s.helpText}>Kaptan, normalde 2×; seçilen karta göre 3× veya 4× puan getirir.</small>
    </label>
    <div className={s.cards}>
     <h3>Menajer kartı seç</h3>
     <p>Kartların bu 15 oyuncuya göre tahmini katkısını karşılaştır. Seçimini kadroyla birlikte kaydet.</p>
     <div className={s.cardGrid}>{offered.map(item=>{
      const supported=supportedCards.has(item.id)
      const estimate=supported?draftProjectedPoints(starters,bench,captain,item.id,playerById):null
      const delta=estimate===null?null:estimate-baseline
      return <button type="button" key={item.id} disabled={locked||!supported}
       title={!supported?(item.id==='attack'?'Hücum için farklı pozisyon dağılımıyla yeniden 15 oyuncu seçilmesi gerekir.':'Limitsiz Bütçe draft tamamlandıktan sonra oyuncu seçimini değiştirmez.'):item.description}
       aria-pressed={card===item.id}
       className={s.card+(card===item.id?' '+s.cardActive:'')+(!supported?' '+s.cardDisabled:'')}
       onClick={()=>{setCard(item.id);setDirty(true)}}>
       <strong>{item.shortLabel}</strong>
       {supported?<b>{formatXfp(estimate)} xFP</b>:<b>Bu draftta yok</b>}
       <small>{item.id==='none'?'Kaptan 2× · Standart kurallar':item.id==='triple_captain'?'Kaptan 3×':item.id==='quad_captain'?'Kaptan 4×':item.id==='bench_boost'?'15 oyuncu puanda':item.id==='attack'?'2 KL / 3 DEF / 5 OS / 5 FOR':'Bütçe sınırı yok'}</small>
       {supported?<em className={delta>0?s.deltaPositive:s.deltaNeutral}>{delta>0?'+':''}{formatXfp(delta)} xFP</em>:<em className={s.unavailable}>Seçilemez</em>}
      </button>
     })}</div>
     <p className={s.cardFoot}>Hücum kartının 2 KL / 3 DEF / 5 OS / 5 FOR kadrosu bu 15 kişilik draft dağılımına uymuyor; Limitsiz Bütçe de seçimler bittiği için avantaj sağlamıyor.</p>
    </div>
   </div>
   <div className={s.formationPanel}>
    <div className={s.formationIntro}>
     <h3>İlk 11 dizilişini seç</h3>
     <p>Her diziliş için en yüksek tahmini puan veren ilk 11 ve kaptan hesaplanır. Seçtikten sonra oyuncuları istediğin gibi değiştirebilirsin.</p>
    </div>
    <div className={s.formationGrid}>
     {formationOptions.map((option,index)=><button type="button" key={option.formation}
      disabled={locked} aria-pressed={formation.label===option.formation}
      className={s.formationOption+(formation.label===option.formation?' '+s.formationSelected:'')}
      onClick={()=>selectFormation(option)}>
      <span>{option.formation}{index===0&&<b>ÖNERİ</b>}</span>
      <strong>{formatXfp(draftProjectedPoints(option.starters,option.bench,option.captain,card,playerById))} <small>xFP</small></strong>
      <small>{formation.label===option.formation?'Seçili diziliş':'Kadroya uygula'}</small>
     </button>)}
    </div>
   </div>
   <div className={s.columns}>
    <div className={s.side}><div className={s.sideHead}><h3>İlk 11</h3><span>{starters.length} oyuncu</span></div>
     <div className={s.players}>{starters.map((id,i)=>{const p=playerById.get(id);return <button key={id} type="button" disabled={locked} aria-pressed={selected?.id===id} className={s.player+(selected?.id===id?' '+s.picked:'')} onClick={()=>choose(id,'starter')}>
      <span className={s.playerIndex}>{i+1}</span><span className={s.playerInfo}><strong>{p?.name||'Oyuncu'}</strong><small>{positions[p?.position]||'—'} · {xfp(p||{}).toFixed(2)} xFP{id===Number(captain)?' · KAPTAN':''}</small></span>
      <span className={s.onPitch}>{id===Number(captain)?'C':'11'}</span>
     </button>})}</div>
    </div>
    <div className={s.side}><div className={s.sideHead}><h3>Yedekler</h3><span>Öncelik sırası</span></div>
      <div className={s.players}>{bench.map((id,i)=>{const p=playerById.get(id);return <div key={id} className={s.benchRow}>
       <button type="button" disabled={locked} aria-pressed={selected?.id===id} className={s.player+(selected?.id===id?' '+s.picked:'')} onClick={()=>choose(id,'bench')}>
        <span className={s.playerIndex}>{i===0?'KL':i}</span><span className={s.playerInfo}><strong>{p?.name||'Oyuncu'}</strong><small>{positions[p?.position]||'—'} · {xfp(p||{}).toFixed(2)} xFP</small></span>
       </button>
       {i>0&&<div className={s.benchButtons}><button type="button" disabled={locked||i===1} title="Yukarı" onClick={()=>swapBench(i,-1)}>↑</button><button type="button" disabled={locked||i===3} title="Aşağı" onClick={()=>swapBench(i,1)}>↓</button></div>}
      </div>})}</div>
    </div>
   </div>
   {!valid&&roster.length===15&&<p className={s.error}>Diziliş veya yedek kaleci geçersiz. Bir kaleci yedekte olmalı; ilk 11 oyun kurallarındaki dizilişlerden birini karşılamalı.</p>}
   {roster.length!==15&&<p className={s.info}>Draft oyuncuları yükleniyor ({roster.length}/15)…</p>}
   <div className={s.footer}><span>{locked?'Bu haftanın kadro son tarihi geçti.':saved?'Hazırsın! Diğer menajerlerin onayı bekleniyor.':dirty?'Kaydedilmemiş değişiklikler var.':'Kadronu kontrol edip hazır olabilirsin.'}</span>
    <button type="button" disabled={!valid||locked||loading||saved} className={s.primary} onClick={()=>void save()}>{loading?'Kaydediliyor…':saved?'Hazırım ✓':'Kadroyu Kaydet ve Hazırım'}</button>
   </div>
  </>}
 </section>
}
