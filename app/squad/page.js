import Link from 'next/link'
import SquadBuilder from '@/components/SquadBuilder'
import { createClient } from '@/lib/supabase/server'
import { getAuthState, getPlayersWithProjection, getRecommendation } from '@/lib/data'
export default async function Squad({searchParams}){
  const auth=await getAuthState(), sp=await searchParams
  if(!auth.userId)return <div className="auth-wrap"><div className="card auth-card"><span className="eyebrow">BENİM KADROM</span><h1>Kişisel analiz için giriş yap</h1><p>15 oyuncunu kaydet; xFP, bütçe ve transfer önerisini otomatik hesaplayalım.</p><Link className="cta" href="/login">Giriş / kayıt</Link></div></div>
  const [{players},{members:recommended}]=await Promise.all([getPlayersWithProjection(),getRecommendation('recommended')])
  const supabase=await createClient(); const {data:sq}=await supabase.from('scout_user_squads').select('id').eq('user_id',auth.userId).eq('is_active',true).maybeSingle(); let initial=[]
  if(sq?.id){const {data:m}=await supabase.from('scout_user_squad_members').select('player_id').eq('squad_id',sq.id);initial=(m||[]).map(x=>x.player_id)}
  return <><div className="section-title"><div><span className="eyebrow">KİŞİSEL ANALİZ</span><h1>Benim Kadrom</h1></div><span className={`plan ${auth.plan}`}>{auth.plan.toUpperCase()}</span></div>{sp?.saved?<div className="alert">Kadro kaydedildi.</div>:null}{sp?.error?<div className="alert error">{sp.error}</div>:null}<SquadBuilder players={players} initialIds={initial} recommendedIds={recommended.map(x=>x.player_id)} plan={auth.plan}/></>
}
