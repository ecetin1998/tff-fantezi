/** Read-only MH-current decision diagnostics. Never rewrites released Monte Carlo. */
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v)
const xfp=p=>num(p?.projection?.xfp)??0

export function squadFragility(lineup=[],playerMap=new Map()){
 const xi=lineup.map(id=>playerMap.get(Number(id))).filter(Boolean)
 if(xi.length!==11)return null
 const lowXI=xi.filter(p=>num(p.projection?.xi_probability)!==null&&Number(p.projection.xi_probability)<.7).length
 const lowMinutes=xi.filter(p=>num(p.projection?.x_minutes)!==null&&Number(p.projection.x_minutes)<60).length
 const issues=xi.filter(p=>num(p.projection?.availability_probability)!==null&&Number(p.projection.availability_probability)<.8).length
 const byClub=new Map()
 for(const p of xi.filter(p=>['GK','DEF'].includes(p.position)))byClub.set(p.team_id,(byClub.get(p.team_id)||0)+1)
 const defensiveStacks=[...byClub.values()].filter(n=>n>=2).length
 return {lowXI,lowMinutes,issues,defensiveStacks,score:2*lowXI+lowMinutes+2*issues+defensiveStacks}
}
export function captainOptions(xi=[],captainId,playerMap=new Map(),captainMultiplier=2){
 const candidates=xi.map(id=>playerMap.get(Number(id))).filter(p=>p&&p.position!=='GK')
 const current=playerMap.get(Number(captainId))
 const baseline=current?xfp(current):0
 return candidates.map(p=>({
   id:p.id,player:p,xfp:xfp(p),xi:num(p.projection?.xi_probability),
   minutes:num(p.projection?.x_minutes),gain:(xfp(p)-baseline)*Math.max(0,captainMultiplier-1)
 })).sort((a,b)=>b.gain-a.gain||b.xfp-a.xfp).slice(0,4)
}
export function risingPlayers(pool=[],rosterIds=[],limit=6){
 const roster=new Set(rosterIds.map(Number))
 return pool.map(p=>{
   const recent=num(p?.role_signal?.last2_minutes),previous=num(p?.role_signal?.previous2_minutes)
   const lastXI=num(p?.role_signal?.last2_xi_probability)
   const previousXI=num(p?.role_signal?.previous2_xi_probability)
   const change=recent===null||previous===null?null:recent-previous
   const xiChange=lastXI===null||previousXI===null?null:lastXI-previousXI
   return {player:p,recent,previous,change,xiChange}
 }).filter(x=>!roster.has(Number(x.player.id))&&x.player.active&&
   x.change!==null&&x.change>=10&&x.recent>=45&&
   (num(x.player.projection?.availability_probability)??1)>=.7 &&
   xfp(x.player)>=1)
 .sort((a,b)=>b.change-a.change||xfp(b.player)-xfp(a.player))
 .slice(0,limit)
}
export function rankSingleTransfers({ids=[],pool=[],playerMap=new Map(),budget=100,
 freeRemaining=1,hitCost=4,clubMax=3,mode='balanced',captainMultiplier=2,
 scoreFn,maxResults=5}={}){
 if(ids.length!==15||typeof scoreFn!=='function')return []
 const roster=ids.map(id=>playerMap.get(Number(id)))
 if(roster.some(p=>!p))return []
 const baseline=scoreFn(ids,{playerMap,captainMultiplier})
 if(!baseline?.firstWeek||!Number.isFinite(baseline.total))return []
 const before=squadFragility(baseline.firstWeek.lineup,playerMap)
 const owned=new Set(ids.map(Number))
 const cost=roster.reduce((sum,p)=>sum+(num(p.price)??0),0)
 const clubCounts=new Map()
 for(const p of roster)clubCounts.set(p.team_id,(clubCounts.get(p.team_id)||0)+1)
 const bestByPos=new Map()
 for(const pos of ['GK','DEF','MID','FWD']){
   bestByPos.set(pos,pool.filter(p=>p?.active&&!owned.has(Number(p.id))&&
     p.position===pos&&num(p.projection?.xfp)!==null&&(num(p.projection.availability_probability)??1)>.05)
     .sort((a,b)=>xfp(b)-xfp(a)).slice(0,12))
 }
 const pre=[]
 for(const outgoing of roster){
   for(const incoming of bestByPos.get(outgoing.position)||[]){
     const difference=(num(incoming.price)??0)-(num(outgoing.price)??0)
     if(cost+difference>budget+1e-6)continue
     if(incoming.team_id!==outgoing.team_id&&(clubCounts.get(incoming.team_id)||0)>=clubMax)continue
     const upside=num(incoming.projection?.p90)!==null&&num(outgoing.projection?.p90)!==null
       ?Number(incoming.projection.p90)-Number(outgoing.projection.p90):null
     if(mode==='ceiling'&&upside===null)continue
     pre.push({outgoing,incoming,difference,upside,rough:xfp(incoming)-xfp(outgoing)})
   }
 }
 pre.sort((a,b)=>b.rough-a.rough||Number(a.incoming.id)-Number(b.incoming.id))
 // Bound expensive autosub/formation evaluation; all published ranks use exact scoreFn.
 const evaluated=pre.slice(0,12).map(candidate=>{
   const nextIds=ids.map(id=>Number(id)===Number(candidate.outgoing.id)?Number(candidate.incoming.id):Number(id))
   const next=scoreFn(nextIds,{playerMap,captainMultiplier})
   if(!next?.firstWeek||!Number.isFinite(next.total))return null
   const hit=freeRemaining>0?0:hitCost
   const net=next.total-baseline.total-hit
   const risk=squadFragility(next.firstWeek.lineup,playerMap)
   const riskBenefit=before&&risk?before.score-risk.score:0
   const score=mode==='safe'?net+.45*riskBenefit
     :mode==='ceiling'?net+.3*(candidate.upside-candidate.rough):net
   return {...candidate,nextIds,plan:next.firstWeek,gross:next.total-baseline.total,
     hit,net,riskBenefit,rankScore:score}
 }).filter(x=>x&&x.net>0)
 evaluated.sort((a,b)=>b.rankScore-a.rankScore||b.net-a.net||Number(a.incoming.id)-Number(b.incoming.id))
 return evaluated.slice(0,maxResults)
}
