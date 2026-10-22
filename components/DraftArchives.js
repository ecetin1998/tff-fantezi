'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import s from './DraftArchives.module.css'

const label=room=>room.status==='finished'?'Tamamlandı ✓':room.status==='drafting'?'Devam ediyor':room.status==='lobby'?'Lobi':room.status==='expired'?'Süresi doldu':'İptal edildi'
const mode=room=>(room.opponent_mode==='computer'?'🤖 Bilgisayara karşı · ':'👥 Arkadaşlara karşı · ')+(room.draft_kind==='auction'?'Açık artırma':room.mode==='snake'?'Snake':'Normal')
export default function DraftArchives({onOpen}){
 const client=useMemo(()=>createClient(),[])
 const [items,setItems]=useState([])
 const [hidden,setHidden]=useState(false)
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const load=useCallback(async(includeHidden)=>{
  const {data,error:loadError}=await client.rpc(includeHidden?'scout_draft_my_hidden_rooms':'scout_draft_my_rooms')
  if(loadError)throw loadError
  setItems(Array.isArray(data)?data:[])
 },[client])
 useEffect(()=>{
  let active=true
  const refresh=async()=>{
   try{if(active)await load(hidden)}
   catch(e){if(active)setError(String(e?.message||e).slice(0,160))}
  }
  void refresh()
  const timer=setInterval(()=>{void refresh()},60000)
  return()=>{active=false;clearInterval(timer)}
 },[hidden,load])
 const apply=async(id,action,success)=>{
  if(busy)return
  setBusy(id);setError('');setMessage('')
  try{
   const {error:rpcError}=await client.rpc(action.name,action.args)
   if(rpcError)throw rpcError
   await load(hidden)
   setMessage(success)
  }catch(e){setError(String(e?.message||e).slice(0,160))}
  finally{setBusy('')}
 }
 const cancel=room=>{
  if(!window.confirm('Bu yarım kalmış draft bütün katılımcılar için iptal edilecek. Tamamlanmış ligler etkilenmez. Devam edilsin mi?'))return
  void apply(room.id,{name:'scout_draft_cancel_room',args:{p_room_id:room.id}},'Oda iptal edildi. Diğer katılımcıların listelerinden de kaldırılacak.')
 }
 const hide=room=>{
  void apply(room.id,{name:'scout_draft_hide_room',args:{p_room_id:room.id,p_hidden:true}},'Oda yalnızca senin listenden kaldırıldı. Gizlenenler bölümünden geri getirebilirsin.')
 }
 const restore=room=>{
  void apply(room.id,{name:'scout_draft_hide_room',args:{p_room_id:room.id,p_hidden:false}},'Oda listene geri eklendi (oda kapandıysa aktif listeye dönmez).')
 }
 return <section className={s.panel} aria-label="Draft odalarım ve geçmişim">
  <div className={s.header}><div><h2>Odalarım ve draft geçmişi</h2><p>Yarım kalan odalar 24 saat etkinlik olmazsa otomatik kapanır. Tamamlanan draftlar korunur.</p></div><span className={s.count}>{items.length} oda</span></div>
  <div className={s.toolbar}><button type="button" disabled={Boolean(busy)} onClick={()=>{setItems([]);setMessage('');setError('');setHidden(v=>!v)}}>{hidden?'← Aktif odalarım':'Gizlenenleri göster'}</button></div>
  {error&&<p role="alert" className={s.error}>{error}</p>}
  {message&&<p role="status" className={s.success}>{message}</p>}
  {!items.length?<p className={s.empty}>{hidden?'Gizlenmiş oda yok.':'Henüz aktif bir draft odan yok. Yeni bir oda oluşturabilirsin.'}</p>:<div className={s.list}>
   {items.map(r=><div className={s.entry} key={r.id}>
    <button type="button" className={s.open} onClick={()=>onOpen(r.id)}>
      <span className={s.top}><strong>{r.team_name}</strong><span className={s.status}>{label(r)} · {r.picked}/{r.team_count*15} →</span></span>
      <span className={s.meta}>MH{r.gameweek} · {r.team_count} takım · {mode(r)} · {new Date(r.created_at).toLocaleDateString('tr-TR')}</span>
      {r.idle_expires_at&&!hidden&&<span className={s.expiry}>Etkinlik olmazsa {new Date(r.idle_expires_at).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} tarihinde otomatik kapanır</span>}
    </button>
    <div className={s.controls}>
     {hidden?<button type="button" className={s.restore} disabled={Boolean(busy)} onClick={()=>restore(r)}>↶ Geri getir</button>:<>
      {r.is_host&&['lobby','drafting'].includes(r.status)&&<button type="button" className={s.cancel} disabled={Boolean(busy)} onClick={()=>cancel(r)}>Odayı iptal et</button>}
      <button type="button" className={s.hide} disabled={Boolean(busy)} onClick={()=>hide(r)}>Listemden kaldır</button>
     </>}
    </div>
   </div>)}
  </div>}
  <p className={s.help}>“Listemden kaldır” sadece sana ait görünümü değiştirir. “Odayı iptal et” tüm katılımcılar için draftı kapatır. Tamamlanmış liglerin puan geçmişi silinmez.</p>
 </section>
}
