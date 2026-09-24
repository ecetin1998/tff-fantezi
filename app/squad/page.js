import Link from 'next/link'
import SquadBuilder from '@/components/SquadBuilder'
import { createClient } from '@/lib/supabase/server'
import { getAuthState, getPlayersWithProjection, getRecommendation } from '@/lib/data'

export default async function Squad({searchParams}){
  const auth=await getAuthState()
  const sp=await searchParams

  if(!auth.userId) return <div className="auth-wrap">
    <div className="card auth-card squad-login-card">
      <span className="eyebrow">BENİM KADROM</span>
      <h1>Kendi fantasy takımını kur</h1>
      <p>15 oyuncunu seç; ilk 11, yedekler, kaptan, bütçe ve xFP analizini tek ekranda yönet.</p>
      <Link className="cta" href="/login">Giriş / kayıt</Link>
    </div>
  </div>

  const [{players,run},{members:recommended}]=await Promise.all([
    getPlayersWithProjection(),
    getRecommendation('recommended')
  ])

  const supabase=await createClient()
  const {data:sq}=await supabase
    .from('scout_user_squads')
    .select('id')
    .eq('user_id',auth.userId)
    .eq('is_active',true)
    .maybeSingle()

  let initialState=[]
  if(sq?.id){
    const {data:m}=await supabase
      .from('scout_user_squad_members')
      .select('player_id,is_captain,bench_order')
      .eq('squad_id',sq.id)
    initialState=(m||[]).map(x=>({
      player_id:Number(x.player_id),
      is_captain:Boolean(x.is_captain),
      bench_order:x.bench_order===null?null:Number(x.bench_order)
    }))
  }

  const recommendedState=(recommended||[]).map((x,i)=>({
    player_id:Number(x.player_id),
    is_captain:Boolean(x.is_captain),
    bench_order:x.squad_slot==='XI'?null:(i+1)
  }))

  return <>
    <div className="section-title squad-page-title">
      <div>
        <span className="eyebrow">FANTASY TAKIM YÖNETİMİ</span>
        <h1>Benim Kadrom</h1>
        <p className="muted">MH{run?.gameweek||'—'} • 15 oyuncu • 100m bütçe</p>
      </div>
      <span className={`plan ${auth.plan}`}>{auth.plan.toUpperCase()}</span>
    </div>

    {sp?.saved?<div className="alert">Kadro, ilk 11, yedek sırası ve kaptan kaydedildi.</div>:null}
    {sp?.error?<div className="alert error">{sp.error}</div>:null}

    <SquadBuilder
      players={players}
      initialState={initialState}
      recommendedState={recommendedState}
      plan={auth.plan}
      gameweek={run?.gameweek}
    />
  </>
}
