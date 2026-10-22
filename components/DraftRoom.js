'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import s from './DraftRoom.module.css'
import DraftLiveStandings from './DraftLiveStandings'
import DraftArchives from './DraftArchives'
import DraftLineupSetup from './DraftLineupSetup'
import DraftLeagueLineups from './DraftLeagueLineups'

const CAPS={GK:2,DEF:5,MID:5,FWD:3}
const P={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}
const F=x=>Number(x||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})
const errors={
 AUTH_REQUIRED:'Giriş yapman gerekiyor.',ROOM_ACCESS_DENIED:'Bu odaya davet koduyla katılmalısın.',
 ROOM_NOT_FOUND:'Oda bulunamadı.',INVALID_TEAM_COUNT:'Katılımcı sayısı 2–8 olmalı.',
 INVALID_TEAM_NAMES:'Takım adları boş veya aynı olamaz.',TEAM_NAME_TAKEN:'Bu takım adı alınmış.',ROOM_FULL:'Bu oda dolu.',LOT_ALREADY_OPEN:'Önce mevcut oyuncunun süresi dolmalı.',WAIT_ONE_NOMINATION_ROUND:'Önce her takım en az bir oyuncu aday göstermeli.',NO_ELIGIBLE_CANDIDATE:'Uygun oyuncu bulunamadı.',DRAFT_ALREADY_STARTED:'Bu draft başladı.',
 ALREADY_JOINED:'Bu odaya zaten katıldın.',SEAT_TAKEN:'Bu takım dolu.',
 HOST_ONLY:'Bu işlemi sadece yönetici yapabilir.',WAIT_FOR_ALL_PLAYERS:'Tüm katılımcılar katılmadan draft başlayamaz.',
 DRAFT_NOT_ACTIVE:'Draft aktif değil.',NOT_YOUR_TURN:'Henüz senin sıran değil.',TURN_EXPIRED:'Seçim süresi doldu, otomatik seçim yapılıyor.',INVALID_TIMER_SETTINGS:'Süre ayarları geçersiz.',
 INVALID_PLAYER:'Bu oyuncu seçilemiyor.',POSITION_FULL:'Bu mevkide kontenjan dolu.',
 PLAYER_ALREADY_PICKED:'Oyuncu zaten seçilmiş.',NOTHING_TO_UNDO:'Geri alınacak seçim yok.', AUCTION_UNDO_UNSUPPORTED:'Açık artırmada geçmiş satışlar geri alınamaz.',AUCTION_NOT_ACTIVE:'Açık artırma aktif değil.', AUCTION_EXPIRED:'Oyuncunun teklif süresi doldu.',ALREADY_LEADING:'Zaten en yüksek teklif sende.',BID_TOO_LOW:'Daha yüksek teklif gir.',BID_EXCEEDS_SAFE_BUDGET:'Bütçe sınırı: kalan kadro yerlerine en az 1 kredi ayırmalısın.'
}
const errorText=e=>{const str=String(e?.message||e);const key=Object.keys(errors).find(k=>str.includes(k));return key?errors[key]:str.slice(0,160)}
const risk=p=>Number(p.availability_probability??1)<.6||Number(p.xi_probability)<.6||Number(p.x_minutes)<45?'Yüksek':Number(p.xi_probability)<.85||Number(p.x_minutes)<70?'Orta':'Düşük'
const sums=rows=>rows.reduce((sum,p)=>sum+Number(p.xfp||0),0)
const positionCounts=rows=>Object.fromEntries(Object.keys(CAPS).map(pos=>[pos,rows.filter(p=>p.position===pos).length]))
function xiScore(rows){
 if(rows.length<11)return null
 // Sorting each position once gives the exact max-XI for every allowed 1-GK formation.
 // Avoid a 2^15 subset scan at every countdown tick in eight-manager rooms.
 const byPos=Object.fromEntries(Object.keys(CAPS).map(pos=>[pos,rows
   .filter(p=>p.position===pos)
   .map(p=>Number(p.xfp||0))
   .sort((a,b)=>b-a)]))
 const sumTop=(pos,n)=>byPos[pos].slice(0,n).reduce((a,b)=>a+b,0)
 if(!byPos.GK.length)return null
 let best=-Infinity
 for(let defenders=3;defenders<=5;defenders++)
  for(let mids=2;mids<=5;mids++){
   const forwards=10-defenders-mids
   if(forwards<1||forwards>3||byPos.DEF.length<defenders||
      byPos.MID.length<mids||byPos.FWD.length<forwards)continue
   const score=sumTop('GK',1)+sumTop('DEF',defenders)+sumTop('MID',mids)+sumTop('FWD',forwards)
   best=Math.max(best,score)
  }
 return Number.isFinite(best)?best:null
}
function Item({p,sort='xfp'}){const metric=sort==='xi'?'İlk 11 %'+Math.round(Number(p.xi_probability||0)*100):sort==='minutes'?'xDak '+Math.round(Number(p.x_minutes||0)):sort==='points'?'Toplam '+Number(p.total_points||0):sort==='price'?'Fiyat '+F(p.price):sort==='value'?'F/P '+F(p.value_score):sort==='p90'?'P90 '+F(p.p90):sort==='six'?'6+ %'+Math.round(Number(p.six_plus_probability||0)*100):null;return <div className={s.pText}><strong>{p.name||p.player_name}</strong><small>{p.team} · {P[p.position]} · {p.role||'—'}</small><small>xDak {Math.round(Number(p.x_minutes||0))} · İlk 11 %{Math.round(100*Number(p.xi_probability||0))} · Risk: {risk(p)}</small>{metric&&<small className={s.sortMetric}>{metric}</small>}</div>}

export default function DraftRoom({initialRoom='',initialInvite=''}) {
 const client=useMemo(()=>createClient(),[])
 const [id,setId]=useState(initialRoom)
 const [room,setRoom]=useState(null)
 const [leagueActive,setLeagueActive]=useState(false)
 const onLeagueActive=useCallback(()=>setLeagueActive(true),[])
 const [pool,setPool]=useState([])
 const [myName,setMyName]=useState('')
 const [joinName,setJoinName]=useState('')
 const [renameName,setRenameName]=useState('')
 const [sort,setSort]=useState('xfp')
 const [sortDirection,setSortDirection]=useState('desc')
 const [proOverlayReady,setProOverlayReady]=useState(false)
 const [proRows,setProRows]=useState(null)
 const [isPro,setIsPro]=useState(false)
 const [teamCount,setTeamCount]=useState(4)
 const [mode,setMode]=useState('snake')
 const [opponentMode,setOpponentMode]=useState('friends')
 const [timerSettings,setTimerSettings]=useState({auction:15,extension:5,classic:60})
 const [syncedTimerRoom,setSyncedTimerRoom]=useState('')
 const [bidAmount,setBidAmount]=useState(1)
 const [serverSnapshot,setServerSnapshot]=useState(0)
 const [clock,setClock]=useState(0)
 const [code,setCode]=useState(initialInvite.toUpperCase())
 const [lobby,setLobby]=useState(null)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [problem,setProblem]=useState('')
 const [search,setSearch]=useState('')
 const [pos,setPos]=useState('ALL')
 const [club,setClub]=useState('ALL')
 const [selected,setSelected]=useState(null)
 const [all,setAll]=useState(false)
 const openRoom=roomId=>{
  setId(roomId);setRoom(null);setLeagueActive(false);setPool([]);setProRows(null);setProOverlayReady(false);setLobby(null);setSelected(null)
  window.history.pushState({},'','/draft?room='+encodeURIComponent(roomId))
 }
 const call=useCallback(async(name,args)=>{
  const {data,error}=await client.rpc(name,args)
  if(error)throw error
  return data
 },[client])
 const refresh=useCallback(async(roomId=id)=>{
  if(!roomId)return
  try{
   const next=await call('scout_draft_state',{p_room_id:roomId})
   if(next?.id&&next?.status==='lobby'&&next.id!==syncedTimerRoom){
    setTimerSettings({auction:Number(next.auction_bid_seconds??15),extension:Number(next.auction_extension_seconds??5),classic:Number(next.classic_pick_seconds??60)})
    setSyncedTimerRoom(next.id)
   }
   setRoom(next);setServerSnapshot(Date.now());setProblem('')
  }
  catch(e){setProblem(errorText(e))}
 },[id,call,syncedTimerRoom])
 useEffect(()=>{
  if(!id)return
  void refresh(id)
  const timer=setInterval(()=>{void refresh(id)},room?.status==='finished'?60000:3000)
  return()=>clearInterval(timer)
 },[id,refresh,room?.status])
 useEffect(()=>{
  if(!id)return
  let active=true
  call('scout_draft_pool',{p_room_id:id}).then(data=>{if(active)setPool(Array.isArray(data)?data:[])}).catch(e=>{if(active)setProblem(errorText(e))})
  return()=>{active=false}
 },[id,call])
 useEffect(()=>{
  const timer=setInterval(()=>setClock(Date.now()),250)
  return()=>clearInterval(timer)
 },[])
 useEffect(()=>{
  if(!id||room?.draft_kind!=='auction'||room?.status!=='drafting')return
  let alive=true,working=false
  const settle=async()=>{
   if(working)return
   working=true
   try{
    await call('scout_draft_auction_advance',{p_room_id:id})
    if(alive)await refresh(id)
   }catch(e){if(alive)setProblem(errorText(e))}
   finally{working=false}
  }
  void settle()
  const timer=setInterval(()=>{void settle()},1500)
  return()=>{alive=false;clearInterval(timer)}
 },[id,room?.draft_kind,room?.status,call,refresh])
 useEffect(()=>{
  if(!id||!['lobby','drafting'].includes(room?.status))return
  let active=true
  const heartbeat=async()=>{
   if(document.visibilityState==='hidden')return
   try{
    const data=await call('scout_draft_heartbeat',{p_room_id:id})
    if(active&&data?.active===false)await refresh(id)
   }catch(e){if(active)setProblem(errorText(e))}
  }
  void heartbeat()
  const timer=setInterval(()=>{void heartbeat()},60000)
  return()=>{active=false;clearInterval(timer)}
 },[id,room?.status,call,refresh])
 useEffect(()=>{
  if(!id||!room?.run_id)return
  let live=true
  setIsPro(false);setProOverlayReady(false);setProRows(null)
  const load=async()=>{
   try{
    const resp=await fetch('/api/access',{cache:'no-store'})
    if(!resp.ok)return
    const access=await resp.json()
    if(!live||access.plan!=='pro')return
    const overlayResponse=await fetch('/api/pro-player-overlay?run_id='+encodeURIComponent(room.run_id),{cache:'no-store'})
    if(!overlayResponse.ok)return
    const overlay=await overlayResponse.json()
    if(!live||overlay.run_id!==room.run_id||!Array.isArray(overlay.rows))return
    const extra=new Map(overlay.rows.map(x=>[Number(x.player_id),x]))
    setProRows(extra)
    setIsPro(true);setProOverlayReady(true)
   }catch{/* Keep public sorting choices when protected analytics are unavailable. */}
  }
  void load()
  return()=>{live=false}
 },[id,room?.run_id])
 useEffect(()=>{
  if(!id||room?.draft_kind!=='classic'||Number(room?.rules_version||1)<2||room?.status!=='drafting')return
  let active=true,working=false
  const advance=async()=>{
   if(working)return
   working=true
   try{
    const result=await call('scout_draft_classic_advance',{p_room_id:id})
    if(active&&result?.advanced)await refresh(id)
   }catch(e){if(active)setProblem(errorText(e))}
   finally{working=false}
  }
  void advance()
  const timer=setInterval(()=>{void advance()},2000)
  return()=>{active=false;clearInterval(timer)}
 },[id,room?.draft_kind,room?.rules_version,room?.status,call,refresh])
 useEffect(()=>{
  if(!id||room?.opponent_mode!=='computer'||room?.status!=='drafting')return
  let alive=true,working=false
  const move=async()=>{
   if(working||document.visibilityState==='hidden')return
   working=true
   try{
    const result=await call('scout_draft_bot_advance',{p_room_id:id})
    if(alive&&result?.advanced)await refresh(id)
   }catch(e){if(alive)setProblem(errorText(e))}
   finally{working=false}
  }
  void move()
  const timer=setInterval(()=>{void move()},1650)
  return()=>{alive=false;clearInterval(timer)}
 },[id,room?.opponent_mode,room?.status,call,refresh])
 const action=async fn=>{
  setBusy(true);setProblem('');setMessage('')
  try{await fn()}catch(e){setProblem(errorText(e))}
  finally{setBusy(false)}
 }
 const teamList=room?.teams||[]
 const picked=room?.picks||[]
 const pickedIds=new Set(picked.map(p=>Number(p.player_id)))
 const playerPool=useMemo(()=>proRows?pool.map(p=>{const extra=proRows.get(Number(p.id));return extra?{...p,p90:extra.p90,six_plus_probability:extra.six_plus_probability}:p}):pool,[pool,proRows])
 const lookup=new Map(playerPool.map(p=>[Number(p.id),p]))
 const teams=teamList.map(t=>{
   const selections=picked.filter(p=>p.team_id===t.id).map(p=>lookup.get(Number(p.player_id))||{name:p.player_name,position:p.position,xfp:p.xfp})
   return {...t,selections,count:positionCounts(selections),total:sums(selections),xi:xiScore(selections)}
 })
 const totalPicks=(room?.team_count||teamCount)*15
 const isAuction=room?.draft_kind==='auction'
 const round=room?Math.ceil(Number(room.next_pick)/room.team_count):1
 const seatBase=room?(room.next_pick-1)%room.team_count+1:1
 const seatNumber=room?(room.mode==='snake'&&round%2===0?room.team_count+1-seatBase:seatBase):1
 const current=room?.status==='drafting'&&!isAuction?teams.find(t=>Number(t.draft_order)===seatNumber):null
 const classicSecondsLeft=room?.turn_ends_at&&serverSnapshot&&clock
  ?Math.max(0,Math.ceil((Date.parse(room.turn_ends_at)-Date.parse(room.server_time)-(clock-serverSnapshot))/1000))
  :null
 const canPick=Boolean(current?.mine)&&room?.status==='drafting'&&!isAuction&&(classicSecondsLeft===null||classicSecondsLeft>0)
 const own=teams.find(t=>t.mine)
 const lot=room?.lot?.status==='open'?room.lot:null
 const secondsLeft=lot?Math.max(0,Math.ceil((Date.parse(lot.ends_at)-Date.parse(lot.server_time)-(clock-serverSnapshot))/1000)):0
 const safeMax=own?100-Number(own.spent||0)-(14-own.selections.length):0
 const canBid=Boolean(isAuction&&lot&&room?.status==='drafting'&&secondsLeft>0&&own&&
 own.count[lot.position]<CAPS[lot.position]&&own.selections.length<15&&
 lot.leader_team_id!==own.id&&Number(bidAmount)>Number(lot.current_bid||0)&&Number(bidAmount)<=safeMax)

 const versionTwo=Number(room?.rules_version||1)>=2
 const inCompletion=Boolean(isAuction&&versionTwo&&room?.auction_phase==='completion')
 const nominator=teams.find(t=>Number(t.draft_order)===Number(room?.nomination_index))
 const canNominate=Boolean(isAuction&&versionTwo&&room?.status==='drafting'&&!inCompletion&&!lot&&nominator?.mine)
 const canComplete=Boolean(inCompletion&&room?.status==='drafting'&&nominator?.mine)
 const canChoose=canPick||canNominate||canComplete
 const sortValue=(p,k)=>k==='xi'?p.xi_probability:k==='minutes'?p.x_minutes:k==='p90'?p.p90:k==='six'?p.six_plus_probability:k==='points'?p.total_points:k==='value'?p.value_score:k==='price'?p.price:p.xfp
 const activeSort=(sort==='p90'||sort==='six')&&!proOverlayReady?'xfp':sort
 const sortPlayers=(a,b)=>{
  const av=sortValue(a,activeSort),bv=sortValue(b,activeSort)
  if(av==null&&bv!=null)return 1
  if(bv==null&&av!=null)return -1
  const diff=Number(av||0)-Number(bv||0)
  return (sortDirection==='asc'?diff:-diff)||Number(b.xfp||0)-Number(a.xfp||0)||String(a.name).localeCompare(String(b.name),'tr')
 }
 const saveTimerSettings=async(roomId)=>{
  await call('scout_draft_config_timers',{
   p_room_id:roomId,
   p_auction_seconds:timerSettings.auction,
   p_auction_extension:timerSettings.extension,
   p_classic_seconds:timerSettings.classic
  })
  await refresh(roomId)
 }
 const timerSliders=modeValue=><div className={s.timerGrid}>
  {modeValue==='auction'?<>
   <label className={s.timerSlider}><span>Oyuncu için başlangıç süresi <strong>{timerSettings.auction} sn</strong></span><input type="range" min="10" max="20" step="1" value={timerSettings.auction} onChange={e=>setTimerSettings(v=>({...v,auction:Number(e.target.value)}))}/><small>10–20 saniye</small></label>
   <label className={s.timerSlider}><span>Her teklif için ek süre <strong>+{timerSettings.extension} sn</strong></span><input type="range" min="1" max="5" step="1" value={timerSettings.extension} onChange={e=>setTimerSettings(v=>({...v,extension:Number(e.target.value)}))}/><small>1–5 saniye</small></label>
  </>:<label className={s.timerSlider}><span>Her seçim için süre <strong>{timerSettings.classic} sn</strong></span><input type="range" min="15" max="120" step="15" value={timerSettings.classic} onChange={e=>setTimerSettings(v=>({...v,classic:Number(e.target.value)}))}/><small>15–120 saniye · Zaman aşımında otomatik xFP seçimi</small></label>}
 </div>
 const available=playerPool.filter(p=>!pickedIds.has(Number(p.id)))
 const fits=p=>canComplete?Boolean(own?.count[p.position]<CAPS[p.position]):!current||current.count[p.position]<CAPS[p.position]
 const clubs=[...new Set(playerPool.map(p=>p.team))].sort((a,b)=>a.localeCompare(b,'tr'))
 const filtered=available.filter(fits).filter(p=>pos==='ALL'||p.position===pos)
   .filter(p=>club==='ALL'||p.team===club)
   .filter(p=>(p.name+' '+p.team).toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
   .sort(sortPlayers)
 const options=available.filter(fits)
 const rosterPhase=room?.status==='finished'&&Boolean(room?.lineup_required)
 const leagueReady=Boolean(rosterPhase&&(leagueActive||room?.league_active_at))
 const main=[...options].sort((a,b)=>{
  const rank=p=>Number(p.xfp)+Number(p.xi_probability||0)*.25+({FWD:.45,MID:.25,DEF:.08,GK:-.3}[p.position]||0)-(risk(p)==='Yüksek'?.4:0)
  return rank(b)-rank(a)
 }).slice(0,5)
 const high=[...options].filter(p=>!main.some(m=>m.id===p.id)).sort((a,b)=>(Number(b.xfp)-Number(b.core_xfp))-(Number(a.xfp)-Number(a.core_xfp))).slice(0,3)
 const surprise=[...options].filter(p=>Number(p.xfp)>=2.6&&Number(p.xfp)<=4.6&&Number(p.xi_probability)>=.8&&!main.some(m=>m.id===p.id)&&!high.some(m=>m.id===p.id)).sort((a,b)=>Number(b.xfp)-Number(a.xfp)).slice(0,3)
 return <section className={s.page}>
  <div className={s.hero}><div><small>FANTEZİ LİG REHBERİ · CANLI ODA</small><h1>Fantasy Draft <em>Arena</em></h1><p>2–8 menajer · Snake, Normal veya Açık Artırma · güncel model xFP</p></div><div className={s.heroScore}><strong>{room?'MH'+room.gameweek:String(teamCount)}</strong><span>{room?.opponent_mode==='computer'?'BOT DRAFT':room?'DRAFT':'TAKIM'}</span></div></div>
  {problem&&<div className={s.error} role="alert">{problem}</div>}
  {message&&<div className={s.success} role="status">{message}</div>}
  {!id&&<div className={s.columns}>
   <div className={s.panel}><small className={s.eyebrow}>YENİ ODA</small><h2>Draft odası oluştur</h2>
    <div className={s.opponentSwitch} role="group" aria-label="Draft rakip modu">
     <button type="button" className={opponentMode==='friends'?s.opponentActive:''} aria-pressed={opponentMode==='friends'} onClick={()=>setOpponentMode('friends')}><span>👥 Arkadaşlara Karşı</span><small>Davet koduyla birlikte oyna</small></button>
     <button type="button" className={opponentMode==='computer'?s.opponentActive:''} aria-pressed={opponentMode==='computer'} onClick={()=>setOpponentMode('computer')}><span>🤖 Bilgisayara Karşı</span><small>1–7 bot · tek başına oyna</small></button>
    </div>
    <p>{opponentMode==='computer'?'Diğer takımları bilgisayar yönetir. Davet göndermeden hemen drafta geçebilirsin.':'İlk takım senin olacak; diğer menajerler davet koduyla kendi takımlarına katılır.'}</p>
    <label>Katılımcı sayısı<select value={teamCount} onChange={e=>setTeamCount(Number(e.target.value))}>{Array.from({length:7},(_,i)=>i+2).map(n=><option value={n} key={n}>{n} kişi</option>)}</select></label>
    <label>Senin takım adın<input maxLength={40} placeholder="Örn. Bilanço" value={myName} onChange={e=>setMyName(e.target.value)}/></label>
    <p>{opponentMode==='computer'?`${teamCount-1} bilgisayar rakibi xFP, forma ve bütçe kurallarına göre seçer.`:'Diğer menajerler davet koduyla katılırken kendi takım isimlerini kendileri belirler.'}</p>
    <label>Draft biçimi<select value={mode} onChange={e=>setMode(e.target.value)}><option value="snake">Klasik · Snake</option><option value="linear">Klasik · Normal</option><option value="auction">Açık Artırma · 100 kredi</option></select></label>{mode==='auction'&&<p>Her takım 100 krediyle başlar. Sırayla oyuncu aday gösterilir; eksik kadrolar 1 krediyle tamamlanabilir.</p>}
    {timerSliders(mode)}
    <button className={s.primary} disabled={busy||!myName.trim()} onClick={()=>action(async()=>{
     let r
     if(opponentMode==='computer'){
      r=await call('scout_draft_create_vs_bot',{p_team_name:myName.trim(),p_mode:mode,p_team_count:teamCount})
     }else{
      const names=Array.from({length:teamCount},(_,i)=>i===0?myName.trim():'Takım '+(i+1))
      r=await call('scout_draft_create',{p_names:names,p_mode:mode})
     }
     openRoom(r.room_id)
     await saveTimerSettings(r.room_id)
     if(opponentMode==='computer'){
      await call('scout_draft_start',{p_room_id:r.room_id})
      await refresh(r.room_id)
      setMessage('Bilgisayar rakipleri hazır! Draft başladı.')
     }else{
      setMessage('Oda oluşturuldu ve süre kuralları kaydedildi.')
     }
    })}>{opponentMode==='computer'?'🤖 Botlara Karşı Başla →':'Oda oluştur →'}</button>
   </div>
   <div className={s.panel}><small className={s.eyebrow}>KATILIM</small><h2>Davet kodun var mı?</h2><p>Arkadaşının kodunu gir, kendi takım adını yaz ve odaya katıl.</p>
    <label>Davet kodu<input maxLength={12} autoCapitalize="characters" placeholder="Örn. AX7K9M2P" value={code} onChange={e=>{setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));setLobby(null)}}/></label>
    <button className={s.secondary} disabled={busy||![8,12].includes(code.length)} onClick={()=>action(async()=>setLobby(await call('scout_draft_lobby',{p_code:code})))}>Odayı bul</button>
    {lobby&&<><div className={s.seats}>{lobby.teams.map(t=><div className={s.seat} key={t.team_index}><strong>{t.occupied?t.name:'Boş takım'}</strong><span>{t.occupied?'Katıldı':'Katılınabilir'}</span></div>)}</div>
    <label>Senin takım adın<input maxLength={40} placeholder="Kendi takım adını yaz" value={joinName} onChange={e=>setJoinName(e.target.value)}/></label>
    <button className={s.primary} disabled={busy||lobby.status!=='lobby'||!joinName.trim()||lobby.teams.every(t=>t.occupied)} onClick={()=>action(async()=>openRoom(await call('scout_draft_join_named',{p_code:code,p_team_name:joinName.trim()})))}>Kendi adımla katıl →</button></>}
   </div>
  </div>}
  {!id&&<DraftArchives onOpen={openRoom}/>}
  {id&&!room&&<div className={s.panel}>Odaya bağlanılıyor... <button className={s.secondary} onClick={()=>{setId('');window.history.pushState({},'','/draft')}}>Geri dön</button></div>}
  {room&&<>
   <div className={s.roomBar}><div><small>DAVET KODU</small><strong>{room.code}</strong><span>{room.status==='lobby'?'Lobi':room.status==='finished'?'Tamamlandı':room.status==='expired'?'Süresi doldu':room.status==='cancelled'?'İptal edildi':'Canlı draft'}</span></div>
    <div className={s.roomActions}><button className={s.secondary} onClick={()=>{setId('');setRoom(null);setPool([]);window.history.pushState({},'','/draft')}}>← Odalarım</button>
    {['lobby','drafting'].includes(room.status)&&<button className={s.secondary} onClick={()=>action(async()=>{await navigator.clipboard.writeText(window.location.origin+'/draft?join='+room.code);setMessage('Davet bağlantısı kopyalandı.')})}>↗ Daveti kopyala</button>}
    {room.is_host&&['lobby','drafting'].includes(room.status)&&<button className={s.archiveDanger} disabled={busy} onClick={()=>{if(!window.confirm('Yarım kalan draft tüm katılımcılar için kapatılacak. Devam edilsin mi?'))return;void action(async()=>{await call('scout_draft_cancel_room',{p_room_id:id});setId('');setRoom(null);window.history.pushState({},'','/draft');setMessage('Oda iptal edildi.')})}}>Odayı iptal et</button>}</div></div>
   {['expired','cancelled'].includes(room.status)&&<div className={s.closedNotice} role="status"><strong>{room.status==='expired'?'Odanın süresi doldu':'Oda iptal edildi'}</strong><p>Draft tamamlanmadan kapandığı için bu odada yeni işlem yapılamaz. Geçmiş seçimler silinmedi.</p><button className={s.secondary} onClick={()=>{setId('');setRoom(null);window.history.pushState({},'','/draft')}}>Odalarıma dön</button></div>}
   {rosterPhase&&(!leagueReady
     ?<DraftLineupSetup roomId={id} picks={picked} pool={pool} myTeamId={own?.id} onLeagueActive={onLeagueActive}/>
     :<><DraftLeagueLineups roomId={id} picks={picked}/><DraftLiveStandings roomId={id}/></>)}
   {!rosterPhase&&<>
   {room.status==='lobby'&&<div className={s.panel}>
    <div className={s.heading}><h2>Kura ve seçim sistemi</h2><span>{teams.filter(t=>t.occupied).length}/{room.team_count} hazır</span></div>
    <div className={s.renameBox}><label>Takım adını değiştir<input maxLength={40} placeholder={own?.team_name||'Takımın'} value={renameName} onChange={e=>setRenameName(e.target.value)}/></label><button className={s.secondary} disabled={busy||!renameName.trim()} onClick={()=>action(async()=>{await call('scout_draft_rename',{p_room_id:id,p_team_name:renameName.trim()});setRenameName('');await refresh()})}>Kaydet</button></div>
    <div className={s.tools}><label>Draft biçimi<select disabled={!room.is_host||busy} value={isAuction?'auction':room.mode} onChange={e=>action(async()=>{await call('scout_draft_config',{p_room_id:id,p_mode:e.target.value,p_shuffle:false});await refresh()})}><option value="snake">Klasik · Snake</option><option value="linear">Klasik · Normal</option><option value="auction">Açık Artırma · 100 kredi</option></select></label>
    {room.is_host&&<button className={s.secondary} disabled={busy} onClick={()=>action(async()=>{await call('scout_draft_config',{p_room_id:id,p_mode:isAuction?'auction':room.mode,p_shuffle:true});await refresh()})}>⇄ Kura çek</button>}</div>
    <div className={s.lobbyTimerPanel}>
      <h3>Seçim süreleri</h3>
      {room.is_host&&Number(room.rules_version||1)>=2?<>
       {timerSliders(isAuction?'auction':'classic')}
       <button className={s.secondary} disabled={busy} onClick={()=>action(async()=>{await saveTimerSettings(id);setMessage('Süreler kaydedildi.')})}>Süre ayarlarını kaydet</button>
      </>:<p>{isAuction?'Oyuncu '+(room.auction_bid_seconds??15)+' sn · her teklifte +'+(room.auction_extension_seconds??5)+' sn':Number(room.rules_version||1)>=2?'Her seçim '+(room.classic_pick_seconds??60)+' sn.':'Bu odada süre sınırı yok.'}</p>}
    </div>
    <div className={s.seats}>{teams.map(t=><div className={s.seat} key={t.id}><small>#{t.draft_order}</small><strong>{t.team_name}</strong><span>{t.mine?'SEN':t.is_bot?'🤖 Bilgisayar':t.occupied?'Katıldı':'Boş'}</span></div>)}</div>
    <p>{isAuction?'Açık artırma: Yeni odalarda oyuncuları menajerler sırayla aday gösterir; satılmayanlar havuza döner.':'İkinci tur: '+(room.mode==='snake'?[...teams].reverse():teams).map(t=>t.team_name).join(' → ')}</p>
    {room.is_host?<button className={s.primary} disabled={busy||teams.some(t=>!t.occupied)} onClick={()=>action(async()=>{await call('scout_draft_start',{p_room_id:id});await refresh()})}>Draftı başlat →</button>:<p>Yönetici kurayı tamamlayınca seçimler başlayacak.</p>}
   </div>}
   {['drafting','finished'].includes(room.status)&&<div className={s.turn}><div><small>{room.status==='finished'?String(totalPicks)+'/'+String(totalPicks)+' TAMAMLANDI':isAuction?'AÇIK ARTIRMA · '+picked.length+'/'+totalPicks+' oyuncu':'TUR '+round+' · SEÇİM '+room.next_pick+'/'+totalPicks}</small><h2>{room.status==='finished'?'Draft tamamlandı!':inCompletion?(nominator?.team_name||'Sıradaki takım')+' kadrosunu tamamlıyor':isAuction?lot?'Teklif zamanı':(nominator?.team_name||'Sıradaki takım')+' oyuncu gösterecek':current?.team_name+' seçiyor'}</h2><p>{inCompletion?'1 kredi sabit fiyatla sıradaki takım eksik oyuncularını seçiyor.':isAuction?'Oyuncular sırayla aday gösterilir; geçerli teklifler süreye +'+(room.auction_extension_seconds??5)+' sn ekler.':canPick?'Sıra sende. Havuzdan oyuncu seç.':room.opponent_mode==='computer'?'Bilgisayar rakipleri otomatik seçim yapar.':'Seçimler tüm ekranlara otomatik yansır.'}</p></div>
    {!isAuction&&room.status==='drafting'&&classicSecondsLeft!==null&&<div className={s.countdown+(classicSecondsLeft<=10?' '+s.countdownUrgent:'')}><strong>{classicSecondsLeft} sn</strong><small>Seçim süresi · bitince otomatik xFP</small></div>}
    {room.is_host&&!isAuction&&<button className={s.secondary} disabled={busy||room.next_pick<=1} onClick={()=>action(async()=>{await call('scout_draft_undo',{p_room_id:id});await refresh()})}>↶ Son seçimi geri al</button>}</div>}
   {room.status==='finished'&&!room.lineup_required&&<DraftLiveStandings roomId={id}/>}
   {room.status==='finished'&&<div className={s.panel}>
     <small className={s.eyebrow}>KAYITLI DRAFT SONUÇLARI</small><h2>Draft sonuçları arşivlendi</h2>
     <p>Takımlar, oyuncular, seçim sırası ve açık artırma fiyatları bu odada saklanır. Odalarım bölümünden tekrar açabilirsin.</p>
     <button className={s.secondary} onClick={()=>action(async()=>{
       const saved=room.results_snapshot?.teams||teams.map(t=>({team_name:t.team_name,players:t.selections}))
       const output=['MH'+room.gameweek+' DRAFT SONUÇLARI',...saved.map(t=>t.team_name+'\n'+(t.players||[]).map(p=>(p.name||p.player_name)+' · '+P[p.position]+' · '+F(p.xfp)+' xFP'+(isAuction?' · '+(p.price??0)+' kredi':'')).join('\n'))].join('\n\n')
       await navigator.clipboard.writeText(output);setMessage('Sonuçlar kopyalandı.')
     })}>↗ Sonuçları kopyala</button>
    </div>}
   <div className={s.heading}><h2>{room.team_count} takımın kadrosu</h2><span>{picked.length}/{totalPicks}</span></div>
   <div className={s.progress}><i style={{width:(picked.length/totalPicks*100)+'%'}}/></div>
   <div className={s.board}>{teams.map(t=><div key={t.id} className={s.card+(current?.id===t.id?' '+s.active:'')}>
    <div className={s.teamTitle}><div><small>#{t.draft_order}{t.mine?' · SEN':t.is_bot?' · 🤖 BOT':''}</small><h3>{t.team_name}</h3></div><strong>{t.selections.length}/15</strong></div>
    <div className={s.counts}>{Object.keys(CAPS).map(p=><span key={p}>{P[p]} {t.count[p]}/{CAPS[p]}</span>)}</div>
    <div className={s.totals}><span>Toplam xFP <b>{F(t.total)}</b></span><span>İlk 11 <b>{t.xi===null?'—':F(t.xi)}</b></span>{isAuction&&<span>Bütçe <b>{t.budget}/100</b></span>}</div>
    <div className={s.roster}>{t.selections.length?t.selections.map((p,i)=><div key={i}><span>{i+1}. {p.name}</span><small>{P[p.position]} · {F(p.xfp)}{isAuction?' · '+(picked.find(x=>Number(x.player_id)===Number(p.id))?.price||0)+' kredi':''}</small></div>):<p>Oyuncu seçilmedi.</p>}</div>
   </div>)}</div>
   {room.status==='drafting'&&isAuction&&versionTwo&&!lot&&<div className={s.panel}>
    <small className={s.eyebrow}>{inCompletion?'KADRO TAMAMLAMA · 1 KREDİ':'SIRADAKİ MENAJER'}</small>
    <h2>{inCompletion?'Eksik kadroları tamamla':(nominator?.team_name||'Sıradaki takım')+' oyuncu aday gösterecek'}</h2>
    <p>{inCompletion?'Sıradaki takım alttaki havuzdan eksik mevkiine uygun bir oyuncuyu 1 krediyle alır.':canNominate?'Havuzdan bir oyuncu seç veya en yüksek xFP oyuncusunu otomatik göster.':'Sıradaki menajerin aday göstermesi bekleniyor.'}</p>
    {canNominate&&<button className={s.secondary} disabled={busy} onClick={()=>action(async()=>{await call('scout_draft_auction_nominate',{p_room_id:id,p_player_id:null});await refresh()})}>En yüksek xFP oyuncusunu göster →</button>}
    {room.is_host&&!inCompletion&&<button className={s.secondary} disabled={busy} onClick={()=>action(async()=>{await call('scout_draft_auction_finish_bidding',{p_room_id:id});await refresh()})}>Kadroları 1 krediyle tamamlama aşamasına geç →</button>}
   </div>}
   {room.status==='drafting'&&isAuction&&<div className={s.panel}>
    <small className={s.eyebrow}>CANLI AÇIK ARTIRMA · 100 KREDİ</small>
    {lot?<div className={s.auctionGrid}>
      <div><h2>{lot.player_name}</h2><p>{lot.team} · {P[lot.position]} · MH{room.gameweek} xFP {F(lot.xfp)}</p>
        <div className={s.auctionStats}><div><small>KALAN SÜRE</small><strong>{secondsLeft} sn</strong></div>
         <div><small>EN YÜKSEK TEKLİF</small><strong>{lot.current_bid} kredi</strong></div>
         <div><small>ÖNDEKİ TAKIM</small><strong>{teams.find(x=>x.id===lot.leader_team_id)?.team_name||'Henüz teklif yok'}</strong></div></div>
        <p>{lot.bid_count||0} teklif · Her geçerli teklifte süreye +{room.auction_extension_seconds??5} sn eklenir.</p>
      </div>
      <div className={s.auctionOffer}>
       <p>Senin kalan bütçen: <b>{own?.budget??'—'}/100</b></p>
       <p>Bu oyuncu için maksimum güvenli teklif: <b>{safeMax} kredi</b></p>
       <label>Teklifin (kredi)<input type="number" min={Number(lot.current_bid||0)+1} max={safeMax}
        value={bidAmount} onChange={e=>setBidAmount(e.target.value)}/></label>
       <div className={s.bidShortcuts}>{[1,2,5].map(increase=><button key={increase} className={s.secondary}
        disabled={busy||!own||Number(lot.current_bid)+increase>safeMax}
        onClick={()=>setBidAmount(Number(lot.current_bid)+increase)}>+{increase} kredi</button>)}</div>
       <button className={s.primary} disabled={!canBid||busy}
         onClick={()=>action(async()=>{await call('scout_draft_auction_bid',{p_room_id:id,p_amount:Number(bidAmount)});await refresh()})}>Teklif ver →</button>
       {secondsLeft<=0&&<small>Süre doldu; sunucu kapanış sonucunu işliyor.</small>}
      </div>
    </div>:<p>{versionTwo?'Sıradaki menajerin oyuncu seçmesi bekleniyor.':'Yeni oyuncu hazırlanıyor. İlk oyuncu otomatik açılır.'}</p>}
   </div>}
   {room.status==='drafting'&&(!isAuction||versionTwo&&!lot)&&<div className={s.poolLayout}><div className={s.panel}>
    <div className={s.heading}><h2>Oyuncu havuzu</h2><span>{available.length} müsait</span></div>
    <div className={s.filters}><input placeholder="Oyuncu veya takım ara" value={search} onChange={e=>{setSearch(e.target.value);setAll(false)}}/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="ALL">Tüm mevkiler</option>{Object.keys(P).map(p=><option value={p} key={p}>{P[p]}</option>)}</select><select value={club} onChange={e=>setClub(e.target.value)}><option value="ALL">Tüm takımlar</option>{clubs.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
    <div className={s.sortBar}><label>Sıralama<select value={activeSort} onChange={e=>{setSort(e.target.value);setAll(false)}}><option value="xfp">xFP'ye göre</option><option value="xi">İlk 11 ihtimaline göre</option><option value="minutes">Dakikaya göre</option>{isPro&&proOverlayReady&&<><option value="p90">P90'a göre</option><option value="six">6+ ihtimaline göre</option></>}<option value="points">Toplam puana göre</option><option value="value">F/P'ye göre</option><option value="price">Fiyata göre</option></select></label><button className={s.secondary} onClick={()=>setSortDirection(d=>d==='desc'?'asc':'desc')} title="Sıralama yönünü değiştir">{sortDirection==='desc'?'Azalan ↓':'Artan ↑'}</button></div>
    <div className={s.pool}>{(all?filtered:filtered.slice(0,35)).map(p=><button key={p.id} disabled={!canChoose||busy} className={s.player+(selected===p.id?' '+s.chosen:'')} onClick={()=>setSelected(p.id)}><Item p={p} sort={activeSort}/><strong>{F(p.xfp)}</strong></button>)}</div>
    {filtered.length>35&&!all&&<button className={s.secondary} onClick={()=>setAll(true)}>Tüm {filtered.length} oyuncuyu göster</button>}
    <div className={s.checkout}><b>{selected?lookup.get(Number(selected))?.name:'Oyuncu seçilmedi'}</b><button className={s.primary} disabled={!canChoose||busy||!selected} onClick={()=>action(async()=>{await call(canNominate?'scout_draft_auction_nominate':canComplete?'scout_draft_auction_complete_pick':'scout_draft_pick',{p_room_id:id,p_player_id:selected});setSelected(null);await refresh()})}>{canNominate?'Oyuncuyu göster →':canComplete?'1 krediyle kadroma al →':'Seçimi onayla →'}</button></div>
   </div>
   <div className={s.panel}><small className={s.eyebrow}>DRAFT ANALİSTİ</small><h2>{isAuction?(nominator?.team_name||'Sıradaki takım')+' için öneriler':current?.team_name+' için öneriler'}</h2>
    {[['En mantıklı 5 seçim',main],['Bonus potansiyeli yüksek 3',high],['Radar altındaki 3',surprise]].map(([title,rows])=><div className={s.suggestions} key={title}><h3>{title}</h3>{rows.map(p=><button key={p.id} disabled={!canChoose||busy} onClick={()=>setSelected(p.id)}><Item p={p}/><strong>{F(p.xfp)}</strong></button>)}</div>)}
    <p>Bu öneriler xFP, ilk 11, rol ve takımın kontenjanına göre hazırlanır. P90 ve 6+ yalnızca Pro erişimiyle sıralanır; ücretsiz üyeler için diğer ölçütler açıktır.</p>
   </div></div>}
   <div className={s.panel}><div className={s.heading}><h2>Seçim geçmişi</h2><span>{picked.length} seçim</span></div><div className={s.history}>{[...picked].reverse().map(p=><div key={p.pick_number}><strong>#{p.pick_number}</strong><span>{p.player_name}</span><small>{teams.find(t=>t.id===p.team_id)?.team_name} · {P[p.position]}{p.auto_selected?' · Otomatik':''}</small><b>{F(p.xfp)}</b></div>)}</div></div>
   <p className={s.note}>Oda oluşturulduğu anda model koşusu sabitlenir. Seçimler üç saniyede bir senkronize edilir. Mevcut site modeli ve kadroların değişmez.</p>
   </>}
  </>}
 </section>
}
