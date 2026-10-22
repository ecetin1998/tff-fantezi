'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import s from './DraftLiveStandings.module.css'

const n=x=>Number(x||0).toLocaleString('tr-TR',{maximumFractionDigits:0})
const P={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}
const statusLabel={
 verified:'Doğrulandı',
 awaiting_points:'Puan kaydı bekleniyor',
 verifying:'Maç bitti · kontrol bekliyor',
 scheduled:'Maç bekleniyor',
 in_progress:'Maç sürüyor · kontrol bekliyor',
 no_fixture:'Fikstür bekleniyor'
}
function scoreText(p){
 if(!p?.match)return 'Maç bilgisi bekleniyor'
 const m=p.match
 return m.home+' – '+m.away+(m.home_goals!=null&&m.away_goals!=null?' · '+m.home_goals+'-'+m.away_goals:'')
}
export default function DraftLiveStandings({roomId}){
 const client=useMemo(()=>createClient(),[])
 const [data,setData]=useState(null)
 const [week,setWeek]=useState(null)
 const [view,setView]=useState('total')
 const [openTeam,setOpenTeam]=useState('')
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 const load=useCallback(async(requestedWeek=null)=>{
  const {data:result,error:rpcError}=await client.rpc('scout_draft_live_standings',{
   p_room_id:roomId,p_gameweek:requestedWeek
  })
  if(rpcError)throw rpcError
  return result
 },[client,roomId])
 useEffect(()=>{
  if(!roomId)return
  let active=true
  let inFlight=false
  const refresh=async()=>{
   if(inFlight)return
   inFlight=true
   try{
    const next=await load(week)
    if(active){setData(next);setError('')}
   }catch(err){
    if(active)setError(String(err.message||err).slice(0,180))
   }finally{inFlight=false}
  }
  void refresh()
  const timer=setInterval(()=>{void refresh()},30000)
  return()=>{active=false;clearInterval(timer)}
 },[roomId,week,load])
 const teams=useMemo(()=>{
  const items=[...(data?.teams||[])]
  const field=view==='week'?'week_points':'total_points'
  items.sort((a,b)=>(Number(b[field]||0)-Number(a[field]||0))||
   (view==='week'?Number(b.total_points||0)-Number(a.total_points||0):Number(b.week_points||0)-Number(a.week_points||0))||
   Number(a.draft_order)-Number(b.draft_order))
  return items
 },[data,view])
 const onlyThisWeek=data?.single_week_only===true
 const selected=data?.selected_gameweek||week
 const weekProgress=data?.weeks?.find(w=>Number(w.gameweek)===Number(selected))
 const verifiedWeek=teams.reduce((v,t)=>v+Number(t.verified_players||0),0)
 const selectedTeam=teams.find(t=>t.team_id===openTeam)||teams.find(t=>t.mine)||teams[0]
 const changeWeek=async value=>{
  setLoading(true)
  try{
   const response=await load(value)
   setData(response);setWeek(value);setError('')
  }catch(err){setError(String(err.message||err).slice(0,180))}
  finally{setLoading(false)}
 }
 return <section className={s.wrap} aria-label="Draft Canlı Fantasy Puan Durumu">
  <div className={s.header}>
   <div>
    <small className={s.eyebrow}>DRAFT SONRASI · GERÇEKLEŞEN FANTASY PUANLARI</small>
    <h2>Canlı Puan Durumu</h2>
    <p>Maçları kapanıp fantasy puanları doğrulanan oyuncuların skorları otomatik eklenir. Tahmini xFP bu sıralamaya dahil edilmez.</p>
   </div>
   <span className={s.livePill}><span className={s.dot}/> 30 sn güncelleme</span>
  </div>
  {error&&<p className={s.error} role="alert">Puan durumu yüklenemedi: {error}</p>}
  {!data?<div className={s.loading}>Doğrulanan oyuncu puanları yükleniyor…</div>:<>
    {!onlyThisWeek?<div className={s.toolbar}>
     <label>Maç haftası
      <select value={Number(selected)} disabled={loading} onChange={e=>void changeWeek(Number(e.target.value))}>
       {(data.weeks||[]).map(w=><option key={w.gameweek} value={w.gameweek}>MH{w.gameweek}</option>)}
      </select>
     </label>
     <div className={s.toggle} role="group" aria-label="Puan türü">
      <button type="button" aria-pressed={view==='total'} className={view==='total'?s.selected:''} onClick={()=>setView('total')}>Genel sıralama</button>
      <button type="button" aria-pressed={view==='week'} className={view==='week'?s.selected:''} onClick={()=>setView('week')}>Bu hafta</button>
     </div>
    </div>:<p className={s.singleWeekLabel}>Bu draft yalnızca MH{selected} için geçerlidir · Haftalık puan sıralaması</p>}
    <div className={s.meta}>
     <span><strong>MH{selected}</strong> · {weekProgress?.verified_matches||0}/{weekProgress?.matches||0} maçın fantasy puanları kapandı</span>
     <span>{verifiedWeek}/{teams.reduce((a,b)=>a+Number(b.player_count||0),0)} oyuncu puanı doğrulandı</span>
    </div>
    {(weekProgress?.matches||0)>0&&<div className={s.progress} title="Puanı kapanan maçlar"><span style={{width:100*Number(weekProgress.verified_matches||0)/Number(weekProgress.matches)+'%'}}/></div>}
    {!verifiedWeek&&<p className={s.pending}>MH{selected} için henüz doğrulanmış oyuncu puanı yok. Maçlar bitip kontrol tamamlanınca tablo otomatik güncellenecek.</p>}
    <div className={s.leaderboard+(onlyThisWeek?' '+s.singleWeek:'')}>
     <div className={s.tableHead}><span>Takım</span><span>{onlyThisWeek?'Puan':'MH'+selected}</span>{!onlyThisWeek&&<span>Toplam</span>}<span>Kontrol</span></div>
     {teams.map((t,i)=><button type="button" key={t.team_id} className={s.row+(t.team_id===selectedTeam?.team_id?' '+s.rowActive:'')} onClick={()=>setOpenTeam(t.team_id)}>
      <span className={s.team}><b className={s.place}>{i+1}.</b><span><strong>{t.team_name}{t.mine?' · SEN':''}</strong><small>{t.player_count}/15 oyuncu</small></span></span>
      <strong className={s.weekNum}>{n(t.week_points)}{!Number(t.verified_players)&&<small>bekliyor</small>}</strong>
      {!onlyThisWeek&&<strong className={s.totalNum}>{n(t.total_points)}</strong>}
      <span className={s.verifiedCount}>{t.verified_players}/{t.player_count}</span>
     </button>)}
    </div>
    {selectedTeam&&<div className={s.details}>
     <div className={s.detailsHead}><div><small>OYUNCU SKORLARI · MH{selected}</small><h3>{selectedTeam.team_name}</h3></div><strong>{n(selectedTeam.week_points)} puan</strong></div>
     <div className={s.players}>
      {[...(selectedTeam.players||[])].sort((a,b)=>{
       const aa=a.points==null?-100000:Number(a.points),bb=b.points==null?-100000:Number(b.points)
       return bb-aa||Number(a.pick_number)-Number(b.pick_number)
      }).map(p=><div key={p.player_id} className={s.player}>
       <div><strong>{p.name}</strong><small>{P[p.position]||p.position} · {scoreText(p)}</small>
         {data.scoring_rule==='lineup_xi_captain_cards'&&<small className={s.roleBadge}>{p.is_captain?'Kaptan':p.auto_sub?'Oyuna giren yedek':p.is_starter?'İlk 11':p.is_bench?'Yedek':'Kadro'}</small>}<small className={p.status==='verified'?s.ok:s.muted}>{statusLabel[p.status]||'Kontrol bekliyor'}</small></div>
       <div className={s.playerPoints}>{p.points===null||p.points===undefined?<span className={s.pendingScore}>—</span>:<strong>{n(data.scoring_rule==='lineup_xi_captain_cards'?p.counted_points:p.points)}</strong>}{p.points!=null&&<small>{data.scoring_rule==='lineup_xi_captain_cards'?'takıma katkı':'puan'}</small>}</div>
      </div>)}
     </div>
    </div>}
    <p className={s.note}>Puanlar {data.scoring_rule==='all_15_players'?'eski odalarda 15 kişilik kadronun tamamından':'ilk 11, kaptan ve seçilen kart kurallarından'} sayılır. {onlyThisWeek?'Bu yarışma sadece MH'+data.draft_gameweek+' içindir; sonraki haftalara taşınmaz.':'Arşivlenen eski odalarda başlangıç haftasından itibaren birikir.'} Doğrulama bekleyen oyunculara geçici sıfır puan yazılmaz; maç sonrası teyit edilen sonuçlar esas alınır.</p>
    <small className={s.updated}>Son sorgu: {data.updated_at?new Date(data.updated_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'}</small>
  </>}
 </section>
}
