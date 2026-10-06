import {FORMATION_MAP} from '@/lib/rules'

const POSITIONS=['GK','DEF','MID','FWD']

function playProbability(p){
  const explicit=p?.projection?.appearance_probability
  if(explicit!==null&&explicit!==undefined)return Math.max(0,Math.min(1,Number(explicit)||0))
  const xi=Number(p?.projection?.xi_probability||0)
  const minutes=Number(p?.projection?.x_minutes||0)
  const availability=Number(p?.projection?.availability_probability??1)
  return Math.max(0,Math.min(1,availability*Math.max(xi,Math.min(1,minutes/90))))
}
function conditionalXfp(p,xfp){
  const probability=playProbability(p)
  return probability>1e-9?xfp/probability:0
}
function formationKey(players){
  const counts={GK:0,DEF:0,MID:0,FWD:0}
  for(const p of players)if(p&&counts[p.position]!==undefined)counts[p.position]++
  if(counts.GK!==1)return null
  const key=`${counts.DEF}-${counts.MID}-${counts.FWD}`
  return FORMATION_MAP[key]?key:null
}
function absenceDistribution(xi){
  let dist=new Map([['0,0,0,0',1]])
  for(const player of xi){
    const idx=POSITIONS.indexOf(player.position),noPlay=1-playProbability(player),next=new Map()
    for(const [key,prob] of dist){
      const state=key.split(',').map(Number)
      next.set(key,(next.get(key)||0)+prob*(1-noPlay))
      const absent=[...state];absent[idx]++
      const absentKey=absent.join(',')
      next.set(absentKey,(next.get(absentKey)||0)+prob*noPlay)
    }
    dist=next
  }
  return dist
}
export function expectedAutosubValue(xi,orderedBench,xfpFor=p=>Number(p?.projection?.xfp||0)){
  if(xi.length!==11||orderedBench.length!==4||!formationKey(xi))return 0
  const goalkeeper=orderedBench.find(p=>p.position==='GK')
  const outfield=orderedBench.filter(p=>p.position!=='GK')
  if(!goalkeeper||outfield.length!==3)return 0
  const bench=[goalkeeper,...outfield],play=bench.map(playProbability),conditional=bench.map(p=>conditionalXfp(p,xfpFor(p)))
  const initial=Object.fromEntries(POSITIONS.map(pos=>[pos,xi.filter(p=>p.position===pos).length]))
  let total=0
  for(const [stateKey,starterProbability] of absenceDistribution(xi)){
    if(starterProbability<=0)continue
    const state=stateKey.split(',').map(Number),absent=Object.fromEntries(POSITIONS.map((p,i)=>[p,state[i]]))
    for(let mask=0;mask<16;mask++){
      let probability=starterProbability
      const played=play.map((p,i)=>{const yes=Boolean(mask&(1<<i));probability*=yes?p:1-p;return yes})
      if(probability<=0)continue
      let value=absent.GK>0&&played[0]?conditional[0]:0
      const missing={DEF:absent.DEF,MID:absent.MID,FWD:absent.FWD},counts={...initial}
      for(let i=0;i<outfield.length;i++){
        if(!played[i+1]||Object.values(missing).reduce((a,b)=>a+b,0)<=0)continue
        const player=outfield[i]
        for(const replaced of [player.position,'DEF','MID','FWD']){
          if(!missing[replaced])continue
          const trial={...counts};trial[replaced]--;trial[player.position]++
          const fake=POSITIONS.flatMap(pos=>Array.from({length:trial[pos]},()=>({position:pos})))
          if(formationKey(fake)){counts[replaced]--;counts[player.position]++;missing[replaced]--;value+=conditional[i+1];break}
        }
      }
      total+=probability*value
    }
  }
  return total
}
function permutations(a){
  if(a.length<=1)return [a]
  return a.flatMap((x,i)=>permutations([...a.slice(0,i),...a.slice(i+1)]).map(rest=>[x,...rest]))
}
function bestWeek(ids,playerMap,xfpFor,captainMultiplier=2){
  const squad=ids.map(id=>playerMap.get(Number(id))).filter(Boolean)
  let best=null
  for(const key of Object.keys(FORMATION_MAP)){
    const need={GK:1,...FORMATION_MAP[key]},xi=[]
    for(const pos of POSITIONS){
      xi.push(...squad.filter(p=>p.position===pos).sort((a,b)=>xfpFor(b)-xfpFor(a)).slice(0,need[pos]||0))
    }
    if(xi.length!==11)continue
    const xiSet=new Set(xi.map(p=>p.id)),bench=squad.filter(p=>!xiSet.has(p.id))
    const gk=bench.find(p=>p.position==='GK'),out=bench.filter(p=>p.position!=='GK')
    if(!gk||out.length!==3)continue
    let autosub=0,benchOrder=[gk,...out]
    for(const order of permutations(out)){
      const candidate=[gk,...order],value=expectedAutosubValue(xi,candidate,xfpFor)
      if(value>autosub){autosub=value;benchOrder=candidate}
    }
    const captain=[...xi].filter(p=>p.position!=='GK').sort((a,b)=>xfpFor(b)-xfpFor(a))[0]
    const base=xi.reduce((s,p)=>s+xfpFor(p),0)
    const total=base+xfpFor(captain)*Math.max(0,captainMultiplier-1)+autosub
    if(!best||total>best.total)best={key,lineup:xi.map(p=>p.id),captain,bench:benchOrder.map(p=>p.id),base,autosub,total}
  }
  return best
}
export function scoreSquad(ids,{playerMap,weeks=[0],weekFactor=()=>1,captainMultiplier=2}={}){
  let total=0,firstWeek=null
  for(const week of weeks){
    const xfpFor=p=>Number(p?.projection?.xfp||0)*Number(weekFactor(p,week)??1)
    const plan=bestWeek(ids,playerMap,xfpFor,captainMultiplier)
    if(!plan)return {total:-Infinity,weeks:[],firstWeek:null}
    if(firstWeek===null)firstWeek=plan
    total+=plan.total
  }
  return {total,weeks:[...weeks],firstWeek}
}
