'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import s from './DraftRoom.module.css'

const CAPS={GK:2,DEF:5,MID:5,FWD:3}
const P={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}
const F=x=>Number(x||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})
const errors={
 AUTH_REQUIRED:'Giriş yapman gerekiyor.',ROOM_ACCESS_DENIED:'Bu odaya davet koduyla katılmalısın.',
 ROOM_NOT_FOUND:'Oda bulunamadı.',INVALID_TEAM_COUNT:'Katılımcı sayısı 2–8 olmalı.',
 INVALID_TEAM_NAMES:'Takım adları boş veya aynı olamaz.',DRAFT_ALREADY_STARTED:'Bu draft başladı.',
 ALREADY_JOINED:'Bu odaya zaten katıldın.',SEAT_TAKEN:'Bu takım dolu.',
 HOST_ONLY:'Bu işlemi sadece yönetici yapabilir.',WAIT_FOR_ALL_PLAYERS:'Tüm katılımcılar katılmadan draft başlayamaz.',
 DRAFT_NOT_ACTIVE:'Draft aktif değil.',NOT_YOUR_TURN:'Henüz senin sıran değil.',
 INVALID_PLAYER:'Bu oyuncu seçilemiyor.',POSITION_FULL:'Bu mevkide kontenjan dolu.',
 PLAYER_ALREADY_PICKED:'Oyuncu zaten seçilmiş.',NOTHING_TO_UNDO:'Geri alınacak seçim yok.', AUCTION_UNDO_UNSUPPORTED:'Açık artırmada geçmiş satışlar geri alınamaz.',AUCTION_NOT_ACTIVE:'Açık artırma aktif değil.', AUCTION_EXPIRED:'Oyuncunun teklif süresi doldu.',ALREADY_LEADING:'Zaten en yüksek teklif sende.',BID_TOO_LOW:'Daha yüksek teklif gir.',BID_EXCEEDS_SAFE_BUDGET:'Bütçe sınırı: kalan kadro yerlerine en az 1 kredi ayırmalısın.'
}
const errorText=e=>{const str=String(e?.message||e);const key=Object.keys(errors).find(k=>str.includes(k));return key?errors[key]:str.slice(0,160)}
const risk=p=>Number(p.availability_probability??1)<.6||Number(p.xi_probability)<.6||Number(p.x_minutes)<45?'Yüksek':Number(p.xi_probability)<.85||Number(p.x_minutes)<70?'Orta':'Düşük'
const sums=rows=>rows.reduce((sum,p)=>sum+Number(p.xfp||0),0)
const positionCounts=rows=>Object.fromEntries(Object.keys(CAPS).map(pos=>[pos,rows.filter(p=>p.position===pos).length]))
function xiScore(rows){
 if(rows.length<11)return null
 let best=-1
 for(let mask=0;mask<(1<<rows.length);mask++){
  let cnt=0,tot=0
  const c={GK:0,DEF:0,MID:0,FWD:0}
  for(let i=0;i<rows.length;i++)if(mask&(1<<i)){cnt++;tot+=Number(rows[i].xfp||0);c[rows[i].position]++}
  if(cnt===11&&c.GK===1&&c.DEF>=3&&c.DEF<=5&&c.MID>=2&&c.MID<=5&&c.FWD>=1&&c.FWD<=3)best=Math.max(best,tot)
 }
 return best<0?null:best
}
function Item({p}){return <div className={s.pText}><strong>{p.name||p.player_name}</strong><small>{p.team} · {P[p.position]} · {p.role||'—'}</small><small>xDak {Math.round(Number(p.x_minutes||0))} · İlk 11 %{Math.round(100*Number(p.xi_probability||0))} · Risk: {risk(p)}</small></div>}

export default function DraftRoom({initialRoom='',initialInvite=''}) {
 const client=useMemo(()=>createClient(),[])
 const [id,setId]=useState(initialRoom)
 const [room,setRoom]=useState(null)
 const [pool,setPool]=useState([])
 const [names,setNames]=useState(['bilanço','Serhat','OHE','HASTEAM'])
 const [teamCount,setTeamCount]=useState(4)
 const [mode,setMode]=useState('snake')
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
  setId(roomId);setRoom(null);setPool([]);setLobby(null);setSelected(null)
  window.history.pushState({},'','/draft?room='+encodeURIComponent(roomId))
 }
 const call=useCallback(async(name,args)=>{
  const {data,error}=await client.rpc(name,args)
  if(error)throw error
  return data
 },[client])
 const refresh=useCallback(async(roomId=id)=>{
  if(!roomId)return
  try{const next=await call('scout_draft_state',{p_room_id:roomId});setRoom(next);setServerSnapshot(Date.now());setProblem('')}
  catch(e){setProblem(errorText(e))}
 },[id,call])
 useEffect(()=>{
  if(!id)return
  void refresh(id)
  const timer=setInterval(()=>{void refresh(id)},3000)
  return()=>clearInterval(timer)
 },[id,refresh])
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
 const action=async fn=>{
  setBusy(true);setProblem('');setMessage('')
  try{await fn()}catch(e){setProblem(errorText(e))}
  finally{setBusy(false)}
 }
 const teamList=room?.teams||[]
 const picked=room?.picks||[]
 const pickedIds=new Set(picked.map(p=>Number(p.player_id)))
 const lookup=new Map(pool.map(p=>[Number(p.id),p]))
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
 const canPick=Boolean(current?.mine)&&room?.status==='drafting'&&!isAuction
 const own=teams.find(t=>t.mine)
 const lot=room?.lot?.status==='open'?room.lot:null
 const secondsLeft=lot?Math.max(0,Math.ceil((Date.parse(lot.ends_at)-Date.parse(lot.server_time)-(clock-serverSnapshot))/1000)):0
 const safeMax=own?100-Number(own.spent||0)-(14-own.selections.length):0
 const canBid=Boolean(isAuction&&lot&&room?.status==='drafting'&&secondsLeft>0&&own&&
 own.count[lot.position]<CAPS[lot.position]&&own.selections.length<15&&
 lot.leader_team_id!==own.id&&Number(bidAmount)>Number(lot.current_bid||0)&&Number(bidAmount)<=safeMax)

 const available=pool.filter(p=>!pickedIds.has(Number(p.id)))
 const fits=p=>!current||current.count[p.position]<CAPS[p.position]
 const clubs=[...new Set(pool.map(p=>p.team))].sort((a,b)=>a.localeCompare(b,'tr'))
 const filtered=available.filter(fits).filter(p=>pos==='ALL'||p.position===pos)
   .filter(p=>club==='ALL'||p.team===club)
   .filter(p=>(p.name+' '+p.team).toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
   .sort((a,b)=>Number(b.xfp)-Number(a.xfp))
 const options=available.filter(fits)
 const main=[...options].sort((a,b)=>{
  const rank=p=>Number(p.xfp)+Number(p.xi_probability||0)*.25+({FWD:.45,MID:.25,DEF:.08,GK:-.3}[p.position]||0)-(risk(p)==='Yüksek'?.4:0)
  return rank(b)-rank(a)
 }).slice(0,5)
 const high=[...options].filter(p=>!main.some(m=>m.id===p.id)).sort((a,b)=>(Number(b.xfp)-Number(b.core_xfp))-(Number(a.xfp)-Number(a.core_xfp))).slice(0,3)
 const surprise=[...options].filter(p=>Number(p.xfp)>=2.6&&Number(p.xfp)<=4.6&&Number(p.xi_probability)>=.8&&!main.some(m=>m.id===p.id)&&!high.some(m=>m.id===p.id)).sort((a,b)=>Number(b.xfp)-Number(a.xfp)).slice(0,3)
 return <section className={s.page}>
  <div className={s.hero}><div><small>FANTEZİ LİG REHBERİ · CANLI ODA</small><h1>Fantasy Draft <em>Arena</em></h1><p>2–8 menajer · Snake, Normal veya Açık Artırma · güncel model xFP</p></div><div className={s.heroScore}><strong>{room?'MH'+room.gameweek:String(teamCount)}</strong><span>{room?'DRAFT':'TAKIM'}</span></div></div>
  {problem&&<div className={s.error} role="alert">{problem}</div>}
  {message&&<div className={s.success} role="status">{message}</div>}
  {!id&&<div className={s.columns}>
   <div className={s.panel}><small className={s.eyebrow}>YENİ ODA</small><h2>Draft odası oluştur</h2><p>İlk takım senin olacak; diğer menajerler davet koduyla kendi takımlarına katılır.</p>
    <label>Katılımcı sayısı<select value={teamCount} onChange={e=>{
      const n=Number(e.target.value);setTeamCount(n)
      setNames(prev=>Array.from({length:n},(_,i)=>prev[i]||('Takım '+(i+1))))
    }}>{Array.from({length:7},(_,i)=>i+2).map(n=><option value={n} key={n}>{n} kişi</option>)}</select></label>
    {names.map((n,i)=><label key={i}>Takım {i+1}<input maxLength={40} value={n} onChange={e=>setNames(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}
    <label>Draft biçimi<select value={mode} onChange={e=>setMode(e.target.value)}><option value="snake">Klasik · Snake</option><option value="linear">Klasik · Normal</option><option value="auction">Açık Artırma · 100 kredi / 15 sn / teklif +5 sn</option></select></label>{mode==='auction'&&<p>Her takımın 100 kredisi var. En yüksek teklif oyuncuyu alır; kalan 15 kişilik kadroyu bitirecek minimum bütçe korunur.</p>}
    <button className={s.primary} disabled={busy} onClick={()=>action(async()=>{const r=await call('scout_draft_create',{p_names:names,p_mode:mode});openRoom(r.room_id);setMessage('Oda oluşturuldu.')})}>Oda oluştur →</button>
   </div>
   <div className={s.panel}><small className={s.eyebrow}>KATILIM</small><h2>Davet kodun var mı?</h2><p>Arkadaşının kodunu girip boş takımlardan birini seç.</p>
    <label>Davet kodu<input maxLength={12} placeholder="ÖRN. 8A1B3F22CD10" value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setLobby(null)}}/></label>
    <button className={s.secondary} disabled={busy||code.length!==12} onClick={()=>action(async()=>setLobby(await call('scout_draft_lobby',{p_code:code})))}>Odayı bul</button>
    {lobby&&<div className={s.seats}>{lobby.teams.map(t=><button className={s.seat} key={t.team_index} disabled={busy||t.occupied||lobby.status!=='lobby'} onClick={()=>action(async()=>openRoom(await call('scout_draft_join',{p_code:code,p_team_index:t.team_index})))}><strong>{t.name}</strong><span>{t.occupied?'Dolu':'Katıl →'}</span></button>)}</div>}
   </div>
  </div>}
  {id&&!room&&<div className={s.panel}>Odaya bağlanılıyor... <button className={s.secondary} onClick={()=>{setId('');window.history.pushState({},'','/draft')}}>Geri dön</button></div>}
  {room&&<>
   <div className={s.roomBar}><div><small>DAVET KODU</small><strong>{room.code}</strong><span>{room.status==='lobby'?'Lobi':room.status==='finished'?'Tamamlandı':'Canlı draft'}</span></div>
    <button className={s.secondary} onClick={()=>action(async()=>{await navigator.clipboard.writeText(window.location.origin+'/draft?join='+room.code);setMessage('Davet bağlantısı kopyalandı.')})}>↗ Daveti kopyala</button></div>
   {room.status==='lobby'&&<div className={s.panel}>
    <div className={s.heading}><h2>Kura ve seçim sistemi</h2><span>{teams.filter(t=>t.occupied).length}/{room.team_count} hazır</span></div>
    <div className={s.tools}><label>Draft biçimi<select disabled={!room.is_host||busy} value={isAuction?'auction':room.mode} onChange={e=>action(async()=>{await call('scout_draft_config',{p_room_id:id,p_mode:e.target.value,p_shuffle:false});await refresh()})}><option value="snake">Klasik · Snake</option><option value="linear">Klasik · Normal</option><option value="auction">Açık Artırma · 100 kredi</option></select></label>
    {room.is_host&&<button className={s.secondary} disabled={busy} onClick={()=>action(async()=>{await call('scout_draft_config',{p_room_id:id,p_mode:isAuction?'auction':room.mode,p_shuffle:true});await refresh()})}>⇄ Kura çek</button>}</div>
    <div className={s.seats}>{teams.map(t=><div className={s.seat} key={t.id}><small>#{t.draft_order}</small><strong>{t.team_name}</strong><span>{t.mine?'SEN':t.occupied?'Katıldı':'Boş'}</span></div>)}</div>
    <p>{isAuction?'Açık artırma: Oyuncular model xFP sırasına göre açılır. Herkes aynı oyuncuya teklif verir.':'İkinci tur: '+(room.mode==='snake'?[...teams].reverse():teams).map(t=>t.team_name).join(' → ')}</p>
    {room.is_host?<button className={s.primary} disabled={busy||teams.some(t=>!t.occupied)} onClick={()=>action(async()=>{await call('scout_draft_start',{p_room_id:id});await refresh()})}>Draftı başlat →</button>:<p>Yönetici kurayı tamamlayınca seçimler başlayacak.</p>}
   </div>}
   {room.status!=='lobby'&&<div className={s.turn}><div><small>{room.status==='finished'?String(totalPicks)+'/'+String(totalPicks)+' TAMAMLANDI':isAuction?'AÇIK ARTIRMA · '+picked.length+'/'+totalPicks+' oyuncu':'TUR '+round+' · SEÇİM '+room.next_pick+'/'+totalPicks}</small><h2>{room.status==='finished'?'Draft tamamlandı!':isAuction?'Teklif zamanı':current?.team_name+' seçiyor'}</h2><p>{isAuction?'Oyuncuya tüm menajerler teklif verebilir. Her yeni teklif +5 saniye.':canPick?'Sıra sende. Havuzdan oyuncu seç.':'Seçimler tüm ekranlara otomatik yansır.'}</p></div>
    {room.is_host&&!isAuction&&<button className={s.secondary} disabled={busy||room.next_pick<=1} onClick={()=>action(async()=>{await call('scout_draft_undo',{p_room_id:id});await refresh()})}>↶ Son seçimi geri al</button>}</div>}
   <div className={s.heading}><h2>{room.team_count} takımın kadrosu</h2><span>{picked.length}/{totalPicks}</span></div>
   <div className={s.progress}><i style={{width:(picked.length/totalPicks*100)+'%'}}/></div>
   <div className={s.board}>{teams.map(t=><div key={t.id} className={s.card+(current?.id===t.id?' '+s.active:'')}>
    <div className={s.teamTitle}><div><small>#{t.draft_order}{t.mine?' · SEN':''}</small><h3>{t.team_name}</h3></div><strong>{t.selections.length}/15</strong></div>
    <div className={s.counts}>{Object.keys(CAPS).map(p=><span key={p}>{P[p]} {t.count[p]}/{CAPS[p]}</span>)}</div>
    <div className={s.totals}><span>Toplam xFP <b>{F(t.total)}</b></span><span>İlk 11 <b>{t.xi===null?'—':F(t.xi)}</b></span>{isAuction&&<span>Bütçe <b>{t.budget}/100</b></span>}</div>
    <div className={s.roster}>{t.selections.length?t.selections.map((p,i)=><div key={i}><span>{i+1}. {p.name}</span><small>{P[p.position]} · {F(p.xfp)}{isAuction?' · '+(picked.find(x=>Number(x.player_id)===Number(p.id))?.price||0)+' kredi':''}</small></div>):<p>Oyuncu seçilmedi.</p>}</div>
   </div>)}</div>
   {room.status==='drafting'&&isAuction&&<div className={s.panel}>
    <small className={s.eyebrow}>CANLI AÇIK ARTIRMA · 100 KREDİ</small>
    {lot?<div className={s.auctionGrid}>
      <div><h2>{lot.player_name}</h2><p>{lot.team} · {P[lot.position]} · MH{room.gameweek} xFP {F(lot.xfp)}</p>
        <div className={s.auctionStats}><div><small>KALAN SÜRE</small><strong>{secondsLeft} sn</strong></div>
         <div><small>EN YÜKSEK TEKLİF</small><strong>{lot.current_bid} kredi</strong></div>
         <div><small>ÖNDEKİ TAKIM</small><strong>{teams.find(x=>x.id===lot.leader_team_id)?.team_name||'Henüz teklif yok'}</strong></div></div>
        <p>{lot.bid_count||0} teklif · Her geçerli teklifte süreye +5 sn eklenir.</p>
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
    </div>:<p>Yeni oyuncu hazırlanıyor. İlk oyuncu otomatik açılır.</p>}
   </div>}
   {room.status==='drafting'&&!isAuction&&<div className={s.poolLayout}><div className={s.panel}>
    <div className={s.heading}><h2>Oyuncu havuzu</h2><span>{available.length} müsait</span></div>
    <div className={s.filters}><input placeholder="Oyuncu veya takım ara" value={search} onChange={e=>{setSearch(e.target.value);setAll(false)}}/><select value={pos} onChange={e=>setPos(e.target.value)}><option value="ALL">Tüm mevkiler</option>{Object.keys(P).map(p=><option value={p} key={p}>{P[p]}</option>)}</select><select value={club} onChange={e=>setClub(e.target.value)}><option value="ALL">Tüm takımlar</option>{clubs.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
    <div className={s.pool}>{(all?filtered:filtered.slice(0,35)).map(p=><button key={p.id} disabled={!canPick||busy} className={s.player+(selected===p.id?' '+s.chosen:'')} onClick={()=>setSelected(p.id)}><Item p={p}/><strong>{F(p.xfp)}</strong></button>)}</div>
    {filtered.length>35&&!all&&<button className={s.secondary} onClick={()=>setAll(true)}>Tüm {filtered.length} oyuncuyu göster</button>}
    <div className={s.checkout}><b>{selected?lookup.get(Number(selected))?.name:'Oyuncu seçilmedi'}</b><button className={s.primary} disabled={!canPick||busy||!selected} onClick={()=>action(async()=>{await call('scout_draft_pick',{p_room_id:id,p_player_id:selected});setSelected(null);await refresh()})}>Seçimi onayla →</button></div>
   </div>
   <div className={s.panel}><small className={s.eyebrow}>DRAFT ANALİSTİ</small><h2>{current?.team_name} için öneriler</h2>
    {[['En mantıklı 5 seçim',main],['Bonus potansiyeli yüksek 3',high],['Radar altındaki 3',surprise]].map(([title,rows])=><div className={s.suggestions} key={title}><h3>{title}</h3>{rows.map(p=><button key={p.id} disabled={!canPick||busy} onClick={()=>setSelected(p.id)}><Item p={p}/><strong>{F(p.xfp)}</strong></button>)}</div>)}
    <p>Bu öneriler xFP, ilk 11, rol ve takımın kontenjanına göre hazırlanır. P90 gibi Pro verileri bu ücretsiz ekranda gösterilmez.</p>
   </div></div>}
   <div className={s.panel}><div className={s.heading}><h2>Seçim geçmişi</h2><span>{picked.length} seçim</span></div><div className={s.history}>{[...picked].reverse().map(p=><div key={p.pick_number}><strong>#{p.pick_number}</strong><span>{p.player_name}</span><small>{teams.find(t=>t.id===p.team_id)?.team_name} · {P[p.position]}</small><b>{F(p.xfp)}</b></div>)}</div></div>
   <p className={s.note}>Oda oluşturulduğu anda model koşusu sabitlenir. Seçimler üç saniyede bir senkronize edilir. Mevcut site modeli ve kadroların değişmez.</p>
  </>}
 </section>
}
