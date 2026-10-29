// Pure and deterministic forecast helpers for the fixed 15-player Draft Arena.
// Estimates use the frozen room projections; final fantasy scores come from
// verified post-match actuals and are never written by these helpers.
const EXPECTED_GK='GK'
const score=(player)=>{const n=Number(player?.xfp||0);return Number.isFinite(n)?n:0}
const ordered=(xs)=>[...xs].sort((a,b)=>score(b)-score(a)||Number(a.id)-Number(b.id))

export function draftFormationOptions(players,formations){
 if(!Array.isArray(players)||players.length!==15)return []
 const options=[]
 for(const [name,slots] of Object.entries(formations)){
  const first=ordered(players.filter(p=>p.position===EXPECTED_GK)).slice(0,1)
  const defenders=ordered(players.filter(p=>p.position==='DEF')).slice(0,slots.DEF)
  const mids=ordered(players.filter(p=>p.position==='MID')).slice(0,slots.MID)
  const forwards=ordered(players.filter(p=>p.position==='FWD')).slice(0,slots.FWD)
  if(first.length!==1||defenders.length!==slots.DEF||mids.length!==slots.MID||forwards.length!==slots.FWD)continue
  const starters=[...first,...defenders,...mids,...forwards]
  if(starters.length!==11)continue
  const chosen=new Set(starters.map(p=>Number(p.id)))
  const remaining=players.filter(p=>!chosen.has(Number(p.id)))
  const bench=[...remaining.filter(p=>p.position===EXPECTED_GK),
   ...ordered(remaining.filter(p=>p.position!==EXPECTED_GK))]
  if(bench.length!==4||bench[0]?.position!=='GK')continue
  const captain=ordered(starters.filter(p=>p.position!=='GK'))[0]||first[0]
  options.push({formation:name,starters:starters.map(p=>Number(p.id)),
   bench:bench.map(p=>Number(p.id)),captain:Number(captain.id),
   base:starters.reduce((sum,p)=>sum+score(p),0)+score(captain)})
 }
 return options.sort((a,b)=>b.base-a.base||a.formation.localeCompare(b.formation))
}

export function draftProjectedPoints(starters,bench,captain,card,playersById){
 const projected=id=>score(playersById.get(Number(id)))
 const xi=(starters||[]).reduce((sum,id)=>sum+projected(id),0)
 const captainPoints=(starters||[]).some(id=>Number(id)===Number(captain))?projected(captain):0
 const benchPoints=(bench||[]).reduce((sum,id)=>sum+projected(id),0)
 const multiplier=card==='quad_captain'?4:card==='triple_captain'?3:2
 return xi+captainPoints*(multiplier-1)+(card==='bench_boost'?benchPoints:0)
}
