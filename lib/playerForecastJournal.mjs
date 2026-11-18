/**
 * Read-only, same-week history of READY Monte Carlo snapshots.
 *
 * IMPORTANT: a READY run is not necessarily a formerly published run.
 * A delta shows that a prediction changed; source timestamps and model
 * labels are context, not proof of why a number changed.
 */
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
const value=v=>finite(v)?Number(v):null
const timestamp=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:null}
const delta=(a,b)=>finite(a)&&finite(b)?Math.round((Number(a)-Number(b))*10000)/10000:null
const isMaterial=d=>d!==null&&Math.abs(d)>=.025
const isXiMaterial=d=>d!==null&&Math.abs(d)>=.01
const isMinuteMaterial=d=>d!==null&&Math.abs(d)>=1
const isAvailableMaterial=d=>d!==null&&Math.abs(d)>=.01
export function buildPlayerForecastJournal(runs=[],projections=[],{gameweek,currentRunId,maxEntries=5}={}){
  const week=Number(gameweek),latest=runs.find(r=>String(r.id)===String(currentRunId))
  const newest=timestamp(latest?.generated_at)
  if(!Number.isInteger(week)||!currentRunId||!latest||newest===null||
      Number(latest.gameweek)!==week||latest.status!=='ready'||!latest.is_current){
    return {entries:[],runsConsidered:0,note:'Aktif modelin koşu geçmişi doğrulanamadı.'}
  }
  const eligible=runs.filter(r=>{
    const t=timestamp(r.generated_at)
    return r.status==='ready'&&Number(r.gameweek)===week&&t!==null&&t<=newest&&
      Number(r.simulation_count)>=40000
  }).sort((a,b)=>timestamp(a.generated_at)-timestamp(b.generated_at)||
    String(a.id).localeCompare(String(b.id)))
  const byRun=new Map()
  for(const p of projections){
    const key=String(p.run_id)
    if(byRun.has(key)){byRun.set(key,null);continue}
    byRun.set(key,p)
  }
  const paired=eligible.filter(r=>{
    const p=byRun.get(String(r.id))
    return p&&finite(p.xfp)&&finite(p.xi_probability)&&finite(p.x_minutes)&&
       Number(p.xi_probability)>=0&&Number(p.xi_probability)<=1&&
       Number(p.x_minutes)>=0&&Number(p.x_minutes)<=180
  }).map(run=>({run,projection:byRun.get(String(run.id))}))
  const history=[]
  for(let i=1;i<paired.length;i++){
    const prior=paired[i-1],now=paired[i]
    const a=now.projection,b=prior.projection
    const changes={
      xfp:delta(a.xfp,b.xfp),xi:delta(a.xi_probability,b.xi_probability),
      minutes:delta(a.x_minutes,b.x_minutes),
      availability:delta(a.availability_probability,b.availability_probability)
    }
    const changed=isMaterial(changes.xfp)||isXiMaterial(changes.xi)||
      isMinuteMaterial(changes.minutes)||isAvailableMaterial(changes.availability)
    if(!changed)continue
    const prevSource=timestamp(prior.run.source_updated_at),nextSource=timestamp(now.run.source_updated_at)
    history.push({
      id:String(now.run.id),at:now.run.generated_at,
      isCurrent:String(now.run.id)===String(currentRunId),
      previousAt:prior.run.generated_at,
      old:{xfp:value(b.xfp),xi:value(b.xi_probability),minutes:value(b.x_minutes)},
      current:{xfp:value(a.xfp),xi:value(a.xi_probability),minutes:value(a.x_minutes)},
      changes,
      sourceTimestampShift:prevSource!==null&&nextSource!==null?prevSource!==nextSource:null,
      // These flags deliberately do not make causal attributions.
      modelLabelShift:String(prior.run.model_version||'')!==String(now.run.model_version||''),
      reason:'Değişimin kesin nedeni bu kayıtlardan belirlenemez.'
    })
  }
  return {
    entries:history.reverse().slice(0,Math.max(1,Math.min(8,Number(maxEntries)||5))),
    runsConsidered:paired.length,
    note:'Yalnız aynı haftanın tamamlanmış hazır koşuları. Önceki koşuların tümü geçmişte canlıya çıkmış olmayabilir.'
  }
}
