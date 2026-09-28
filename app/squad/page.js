import Link from 'next/link'
import SquadBuilder from '@/components/SquadBuilder'
import {createClient} from '@/lib/supabase/server'
import {getAuthState,getSquadPlayerPool,getRecommendation} from '@/lib/data'
import {BUDGET,FORMATION_SET,SQUAD_SIZE} from '@/lib/rules'
import {playerLabel} from '@/lib/playerPresentation'
import {reportServerError} from '@/lib/observability'

export const metadata={title:'Benim Kadrom'}

const key=(gw,id)=>`${gw}:${id}`

function scoreSnapshot(snapshot,pointMap,posMap){
  const members=Array.isArray(snapshot.members)?snapshot.members:[]
  if(!members.length)return null
  const played=id=>Number(pointMap.get(key(snapshot.gameweek,id))?.minutes||0)>0
  const points=id=>Number(pointMap.get(key(snapshot.gameweek,id))?.points||0)
  const starters=members.filter(x=>x.bench_order===null).map(x=>Number(x.player_id))
  const bench=members.filter(x=>x.bench_order!==null).sort((a,b)=>Number(a.bench_order)-Number(b.bench_order)).map(x=>Number(x.player_id))
  const final=[...starters]
  const used=new Set()

  const missingGk=final.find(id=>posMap.get(id)==='GK'&&!played(id))
  if(missingGk){
    const reserve=bench.find(id=>posMap.get(id)==='GK'&&played(id))
    if(reserve){final[final.indexOf(missingGk)]=reserve;used.add(reserve)}
  }

  for(const reserve of bench){
    if(used.has(reserve)||posMap.get(reserve)==='GK'||!played(reserve))continue
    const missing=final.find(id=>!played(id)&&posMap.get(id)!=='GK')
    if(!missing)break
    const trial=final.map(id=>id===missing?reserve:id)
    const counts={DEF:0,MID:0,FWD:0}
    for(const id of trial){const pos=posMap.get(id);if(pos in counts)counts[pos]++}
    if(FORMATION_SET.has(`${counts.DEF}-${counts.MID}-${counts.FWD}`)){
      final[final.indexOf(missing)]=reserve;used.add(reserve)
    }
  }

  let total=final.reduce((sum,id)=>sum+points(id),0)
  const captain=Number(snapshot.captain_id)
  if(final.includes(captain)&&played(captain))total+=points(captain)
  return total
}

export default async function Squad({searchParams}){
  const [auth,sp]=await Promise.all([getAuthState(),searchParams])
  const publicDataPromise=Promise.all([getSquadPlayerPool(),getRecommendation('recommended')])

  if(!auth.userId)return <div className="auth-wrap"><div className="card auth-card squad-login-card">
    <span className="eyebrow">BENİM KADROM</span><h1>Kendi fantezi takımını kur</h1>
    <p>{SQUAD_SIZE} oyuncunu seç; ilk 11, yedekler, kaptan, bütçe ve xFP analizini tek ekranda yönet.</p>
    <Link className="cta" href="/login">Giriş / kayıt</Link>
  </div></div>

  const [{players,run},{members:recommended}]=await publicDataPromise
  const supabase=await createClient()

  const [{data:sq,error:sqError},{data:gameweekRow,error:gwError},{data:snapshots,error:snapshotError}]=await Promise.all([
    supabase.from('scout_user_squads').select('id').eq('user_id',auth.userId).eq('is_active',true).maybeSingle(),
    run?.gameweek?supabase.from('scout_gameweeks').select('gameweek,deadline_at,locked_at').eq('gameweek',run.gameweek).maybeSingle():Promise.resolve({data:null,error:null}),
    supabase.from('scout_user_squad_snapshots').select('gameweek,members,captain_id,locked_at,updated_at').eq('user_id',auth.userId).order('gameweek',{ascending:false}).limit(34)
  ])
  for(const [scope,error] of [['squad:active',sqError],['squad:gameweek',gwError],['squad:snapshots',snapshotError]])if(error)reportServerError(scope,error)

  let initialState=[]
  if(sq?.id){
    const {data:m,error}=await supabase.from('scout_user_squad_members').select('player_id,is_captain,bench_order').eq('squad_id',sq.id)
    if(error)reportServerError('squad:members',error)
    initialState=(m||[]).map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.bench_order===null?null:Number(x.bench_order)}))
  }

  const currentSnapshot=(snapshots||[]).find(s=>Number(s.gameweek)===Number(run?.gameweek))
  if(currentSnapshot?.members?.length)initialState=currentSnapshot.members.map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.bench_order===null?null:Number(x.bench_order)}))

  let recommendedBenchOrder=0
  const recommendedState=(recommended||[]).map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.squad_slot==='XI'?null:(++recommendedBenchOrder)}))

  const snapshotIds=[...new Set((snapshots||[]).flatMap(s=>(Array.isArray(s.members)?s.members:[]).map(x=>Number(x.player_id))).filter(Boolean))]
  let pointRows=[],positionRows=[]
  if(snapshotIds.length){
    const [pointsRes,positionsRes]=await Promise.all([
      supabase.from('scout_player_weekly_points').select('player_id,gameweek,points,minutes,is_final').in('player_id',snapshotIds).eq('is_final',true),
      supabase.from('scout_players').select('id,position,short_label,display_name,full_name').in('id',snapshotIds)
    ])
    if(pointsRes.error)reportServerError('squad:snapshotPoints',pointsRes.error)
    if(positionsRes.error)reportServerError('squad:snapshotPlayers',positionsRes.error)
    pointRows=pointsRes.data||[];positionRows=positionsRes.data||[]
  }
  const pointMap=new Map(pointRows.map(x=>[key(x.gameweek,x.player_id),x]))
  const posMap=new Map(positionRows.map(x=>[Number(x.id),x.position]))
  const playerMap=new Map(positionRows.map(x=>[Number(x.id),x]))
  const snapshotHistory=(snapshots||[]).map(s=>({...s,actual_points:scoreSnapshot(s,pointMap,posMap)}))

  const locked=Boolean(gameweekRow?.locked_at)

  return <>
    <div className="section-title squad-page-title"><div><span className="eyebrow">FANTEZİ TAKIM YÖNETİMİ</span><h1>Benim Kadrom</h1>
      <p className="muted">MH{run?.gameweek||'—'} • {SQUAD_SIZE} oyuncu • {BUDGET}m bütçe</p></div>
      <span className={`plan ${auth.plan}`}>{auth.plan.toUpperCase()}</span>
    </div>
    {sp?.saved?<div className="alert">Kadro, ilk 11, yedek sırası ve kaptan kaydedildi.</div>:null}
    {sp?.error?<div className="alert error">{sp.error}</div>:null}

    <SquadBuilder players={players} initialState={initialState} recommendedState={recommendedState}
      plan={auth.plan} gameweek={run?.gameweek} deadlineAt={gameweekRow?.deadline_at||null} locked={locked}
      transferScenarios={[]}/>

    <section className="card squad-history-card">
      <div className="panel-head"><div><span className="eyebrow">HAFTALIK SNAPSHOT</span><h2>Geçmiş kadro ve puanlar</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>MH</th><th>Kaptan</th><th>Durum</th><th>Gerçek puan</th></tr></thead>
      <tbody>{snapshotHistory.length?snapshotHistory.map(s=><tr key={s.gameweek}><td>MH{s.gameweek}</td>
        <td>{playerLabel(playerMap.get(Number(s.captain_id)))}</td>
        <td>{s.locked_at?'Kilitli':'Açık'}</td><td><b>{s.actual_points===null?'—':s.actual_points}</b></td></tr>)
        :<tr><td colSpan="4">Henüz haftalık snapshot yok.</td></tr>}</tbody></table></div>
    </section>
  </>
}
