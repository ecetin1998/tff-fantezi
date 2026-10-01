import Link from 'next/link'
import SquadBuilder from '@/components/SquadBuilder'
import {createClient} from '@/lib/supabase/server'
import {getAuthState,getSquadPlayerPool,getRecommendation} from '@/lib/data'
import {BUDGET,FORMATIONS,SQUAD_SIZE} from '@/lib/rules'
import {playerLabel} from '@/lib/playerPresentation'
import {reportServerError} from '@/lib/observability'
import {MANAGER_CARD_NONE,captainMultiplierForCard,formationsForCard,managerCardInfo,normalizeManagerCard} from '@/lib/managerCards'

export const metadata={title:'Benim Kadrom'}

const key=(gw,id)=>`${gw}:${id}`

function scoreSnapshot(snapshot,pointMap,posMap){
  const members=Array.isArray(snapshot.members)?snapshot.members:[]
  if(!members.length)return null
  const managerCard=normalizeManagerCard(snapshot.manager_card||members[0]?.manager_card||MANAGER_CARD_NONE)
  const cardInfo=managerCardInfo(managerCard)
  const formationSet=new Set(formationsForCard(managerCard,FORMATIONS))
  const finalRows=members.map(x=>pointMap.get(key(snapshot.gameweek,Number(x.player_id))))
  if(finalRows.some(row=>!row))return null
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
    const trialFormation=`${counts.DEF}-${counts.MID}-${counts.FWD}`
    if(formationSet.has(trialFormation)){
      final[final.indexOf(missing)]=reserve;used.add(reserve)
    }
  }

  let total=cardInfo.benchBoost
    ?members.reduce((sum,row)=>sum+points(Number(row.player_id)),0)
    :final.reduce((sum,id)=>sum+points(id),0)
  const captain=Number(snapshot.captain_id)
  const captainCounted=cardInfo.benchBoost
    ?members.some(row=>Number(row.player_id)===captain)
    :final.includes(captain)
  if(captainCounted&&played(captain)){
    total+=points(captain)*Math.max(0,captainMultiplierForCard(managerCard)-1)
  }
  return total
}

export default async function Squad({searchParams}){
  const [auth,sp,pool,recommendation,supabase]=await Promise.all([
    getAuthState(),
    searchParams,
    getSquadPlayerPool(),
    getRecommendation('recommended'),
    createClient()
  ])

  if(!auth.userId)return <div className="auth-wrap"><div className="card auth-card squad-login-card">
    <span className="eyebrow">BENİM KADROM</span><h1>Kendi fantezi takımını kur</h1>
    <p>{SQUAD_SIZE} oyuncunu seç; ilk 11, yedekler, kaptan, bütçe ve xFP analizini tek ekranda yönet.</p>
    <Link className="cta" href="/login">Giriş / kayıt</Link>
  </div></div>

  const {players,run}=pool
  const {members:recommended}=recommendation
  const {data:pageData,error:pageError}=run?.gameweek
    ?await supabase.rpc('scout_my_squad_page',{p_gameweek:run.gameweek})
    :{data:null,error:null}
  if(pageError)reportServerError('squad:pageData',pageError,{gameweek:run?.gameweek})

  const gameweekRow=pageData?.gameweek||null
  const snapshots=Array.isArray(pageData?.snapshots)?pageData.snapshots:[]
  let initialState=(Array.isArray(pageData?.members)?pageData.members:[]).map(x=>({
    player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),
    bench_order:x.bench_order===null||x.bench_order===undefined?null:Number(x.bench_order)
  }))

  const currentSnapshot=(snapshots||[]).find(s=>Number(s.gameweek)===Number(run?.gameweek))
  const initialManagerCard=auth.plan==='pro'
    ?normalizeManagerCard(currentSnapshot?.members?.[0]?.manager_card||MANAGER_CARD_NONE)
    :MANAGER_CARD_NONE
  if(currentSnapshot?.members?.length)initialState=currentSnapshot.members.map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.bench_order===null?null:Number(x.bench_order)}))

  let recommendedBenchOrder=0
  const recommendedState=(recommended||[]).map(x=>({player_id:Number(x.player_id),is_captain:Boolean(x.is_captain),bench_order:x.squad_slot==='XI'?null:(++recommendedBenchOrder)}))

  const pointRows=Array.isArray(pageData?.points)?pageData.points:[]
  const positionRows=Array.isArray(pageData?.players)?pageData.players:[]
  const pointMap=new Map(pointRows.map(x=>[key(x.gameweek,x.player_id),x]))
  const posMap=new Map(positionRows.map(x=>[Number(x.id),x.position]))
  const playerMap=new Map(positionRows.map(x=>[Number(x.id),x]))
  const currentGameweek=Number(run?.gameweek||0)
  const snapshotHistory=(snapshots||[])
    .filter(s=>Number(s.gameweek)<currentGameweek||Boolean(s.locked_at))
    .map(s=>({...s,actual_points:scoreSnapshot(s,pointMap,posMap)}))

  const locked=Boolean(gameweekRow?.locked_at)

  return <>
    <div className="section-title squad-page-title"><div><span className="eyebrow">FANTEZİ TAKIM YÖNETİMİ</span><h1>Benim Kadrom</h1>
      <p className="muted">MH{run?.gameweek||'—'} • {SQUAD_SIZE} oyuncu • {BUDGET}m bütçe</p></div>
      <span className={`plan ${auth.plan}`}>{auth.plan==='pro'?'GELİŞMİŞ':'ÜCRETSİZ'}</span>
    </div>
    {sp?.saved?<div className="alert">Kadro, ilk 11, yedek sırası ve kaptan kaydedildi.</div>:null}
    {sp?.error?<div className="alert error">{sp.error}</div>:null}

    <SquadBuilder players={players} initialState={initialState} recommendedState={recommendedState}
      initialManagerCard={initialManagerCard}
      plan={auth.plan} gameweek={run?.gameweek} deadlineAt={gameweekRow?.deadline_at||null} locked={locked}
      transferScenarios={[]}/>

    <section className="card squad-history-card">
      <div className="squad-history-head">
        <div><span className="eyebrow">HAFTALIK KAYIT</span><h2>Geçmiş haftalar</h2></div>
        <p>Hafta kilitlendikten sonra kayıtlı 15'li kadro, otomatik yedekler ve kaptan bonusuyla gerçek puanın burada kesinleşir.</p>
      </div>
      {snapshotHistory.length?<div className="squad-history-list">{snapshotHistory.map(s=>{
        const complete=s.actual_points!==null
        return <article className="squad-history-item" key={s.gameweek}>
          <div className="squad-history-week">
            <span>MH{s.gameweek}</span>
            <em className={complete?'complete':'pending'}>{complete?'Tamamlandı':'Puanlar bekleniyor'}</em>
          </div>
          <div className="squad-history-captain">
            <small>Kaptan</small>
            <b>{playerLabel(playerMap.get(Number(s.captain_id)))}</b>
            <em>{managerCardInfo(s.members?.[0]?.manager_card).label}</em>
          </div>
          <div className="squad-history-score">
            <small>Gerçek puan</small>
            <strong>{complete?s.actual_points:'—'}</strong>
          </div>
        </article>
      })}</div>:<div className="squad-history-empty">
        <b>Henüz tamamlanan maç haftası yok.</b>
        <span>MH{currentGameweek||'—'} kadron aktif. Hafta kapanıp oyuncu puanları kesinleşince ilk haftalık kayıt burada görünecek.</span>
      </div>}
    </section>
  </>
}
