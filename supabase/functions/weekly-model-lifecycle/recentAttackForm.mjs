import {trustedMinute} from "./momentum.mjs"

/**
 * Evidence-gated, forecast-only last-3-game attacking activity.
 * Observed Fantasy points, goals and bonuses NEVER become attacking rates.
 * A missing weekly stat is UNKNOWN, not a zero. Two independent matches
 * including the immediately preceding GW are mandatory.
 * A repeated shot trend can gently move expected xG; key passes move xA.
 * These inputs are anchored to the stable run, never recalibrated recursively.
 */
const finitePositive=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0
const safeCount=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max?v:null
const clamp=(a,b,x)=>Math.max(a,Math.min(b,x))

function recentSignal({weekly=[],advanced=[],verified=[],targetWeek,metric,seasonRate}={}){
  if(!Number.isInteger(targetWeek)||targetWeek<4||!finitePositive(seasonRate)||seasonRate<.05)
    return {factor:1,reason:"insufficient_season_baseline",weeks:[]}
  const byWeek=new Map((weekly||[]).map(x=>[Number(x.gameweek),x]))
  const advancedByWeek=new Map((advanced||[]).map(x=>[Number(x.gameweek),x]))
  const verifiedByWeek=new Map((verified||[]).map(x=>[Number(x.gameweek),x]))
  const evidence=[]
  for(let offset=1;offset<=3;offset++){
    const week=targetWeek-offset
    const minutes=trustedMinute(byWeek.get(week))
    if(minutes===null||minutes<45)continue
    // Source priority: independently verified match attack stats, then
    // weekly advanced stats; never merge the two into a fabricated total.
    const v=verifiedByWeek.get(week),a=advancedByWeek.get(week)
    const n=safeCount(v?.[metric],metric==="shots"?12:20)
    const count=n!==null?n:safeCount(a?.[metric],metric==="shots"?12:20)
    if(count===null)continue
    evidence.push({week,minutes,count,weight:4-offset})
  }
  if(evidence.length<2||!evidence.some(x=>x.week===targetWeek-1))
    return {factor:1,reason:"insufficient_recent_coverage",weeks:evidence.map(x=>x.week)}
  const minutes=evidence.reduce((s,x)=>s+x.minutes,0)
  if(minutes<120)return {factor:1,reason:"insufficient_exposure",weeks:evidence.map(x=>x.week)}
  const weightedMinutes=evidence.reduce((s,x)=>s+x.minutes*x.weight,0)
  const weightedCount=evidence.reduce((s,x)=>s+x.count*x.weight,0)
  const per90=90*weightedCount/weightedMinutes
  const relative=clamp(.15,4,(per90+.03)/(seasonRate+.03))
  const boost=relative>1.20
  // One big chance/shot-volume week is not a proven new role or form.
  // Require actions in at least two *distinct* weeks to reward an upturn.
  const repeat=evidence.filter(x=>x.count>0).length>=2
  const concentration=evidence.length>1
    ?Math.max(...evidence.map(x=>x.count*x.weight))/(weightedCount||1):1
  if(boost&&(!repeat||concentration>.70))
    return {factor:1,reason:"one_match_surge_not_repeatable",weeks:evidence.map(x=>x.week)}
  const coverage=evidence.length===3?1:.65
  const strength=clamp(0,.85,minutes/(minutes+180))
  const raw=Math.log(relative)*.35*coverage*strength
  // Max +8% or -12% on only the appropriate attacking rate channel.
  const delta=clamp(-.12,.08,raw)
  return {factor:1+delta,reason:"repeated_source_backed_activity",
    weeks:evidence.map(x=>x.week),recentPer90:per90,baselinePer90:seasonRate,
    repeat,delta}
}

export function recentAttackForm({
  position,weekly=[],advanced=[],verified=[],targetWeek,
  seasonShotsPer90=null,seasonKeyPassesPer90=null,
  xgPer90,xaPer90
}={}){
  const original={xgPer90,xaPer90,applied:false,reason:"not_applicable",
    shots:{factor:1},keyPasses:{factor:1}}
  if(position==="GK"||!["DEF","MID","FWD"].includes(position)||
     !finitePositive(xgPer90)||!finitePositive(xaPer90))
    return original
  const shots=recentSignal({weekly,advanced,verified,targetWeek,metric:"shots",seasonRate:seasonShotsPer90})
  const keyPasses=recentSignal({weekly,advanced,verified,targetWeek,metric:"key_passes",seasonRate:seasonKeyPassesPer90})
  const nextXg=Math.max(0,xgPer90*shots.factor)
  const nextXa=Math.max(0,xaPer90*keyPasses.factor)
  return {xgPer90:nextXg,xaPer90:nextXa,
    applied:Math.abs(nextXg-xgPer90)>1e-8||Math.abs(nextXa-xaPer90)>1e-8,
    reason:"source_gated_last3_activity",shots,keyPasses}
}

/**
 * Pagination is required: three weeks can exceed PostgREST's 1,000-row cap.
 * Any upstream failure fails closed; never silently truncate the signal pool.
 */
export async function fetchRecentAttackEvidence(sb,targetWeek){
  const fromWeek=Math.max(1,Number(targetWeek)-3)
  async function read(table,columns){
    const rows=[]
    for(let start=0;start<10000;start+=500){
      const q=await sb.from(table).select(columns).eq("season","2026-27")
        .gte("gameweek",fromWeek).lt("gameweek",Number(targetWeek))
        .order("gameweek",{ascending:false}).order("player_id",{ascending:true})
        .range(start,start+499)
      if(q.error)return {data:null,error:q.error}
      const batch=q.data||[]
      rows.push(...batch)
      if(batch.length<500)return {data:rows,error:null}
    }
    return {data:null,error:new Error("RECENT_ATTACK_PAGINATION_LIMIT")}
  }
  const [advanced,verified]=await Promise.all([
    read("scout_player_advanced_weekly","player_id,gameweek,shots,key_passes,source"),
    read("scout_verified_weekly_attack","player_id,gameweek,shots,key_passes,source")
  ])
  return advanced.error||verified.error
    ?{data:null,error:advanced.error||verified.error}
    :{data:{advanced:advanced.data,verified:verified.data},error:null}
}

export function groupRecentAttack(rows=[]){
  const byPlayer=new Map()
  for(const row of rows||[]){
    const id=Number(row.player_id)
    if(!byPlayer.has(id))byPlayer.set(id,[])
    byPlayer.get(id).push(row)
  }
  return byPlayer
}
