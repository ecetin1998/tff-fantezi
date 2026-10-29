// Recommend the strongest XI for each *allowed* formation using only
// the manager's 15 drafted players. The standard captain multiplier is 2x;
// manager cards only change the captain multiplier or count the four bench.
export function rankDraftFormations(players,formationMap,managerCard='none'){
 const unique=new Map()
 for(const row of players||[]){
  const id=Number(row?.id)
  if(!Number.isSafeInteger(id)||!row?.position)continue
  unique.set(id,{...row,id,xfp:Number(row.xfp)||0})
 }
 const squad=[...unique.values()]
 const multiplier=managerCard==='quad_captain'?4:managerCard==='triple_captain'?3:2
 const benchBoost=managerCard==='bench_boost'
 const ranked=[]
 for(const [key,shape] of Object.entries(formationMap||{})){
  const counts={GK:1,DEF:shape.DEF,MID:shape.MID,FWD:shape.FWD}
  const selected=[]
  for(const position of ['GK','DEF','MID','FWD']){
   const top=squad.filter(p=>p.position===position)
    .sort((a,b)=>b.xfp-a.xfp||a.id-b.id)
    .slice(0,counts[position])
   selected.push(...top)
  }
  if(selected.length!==11)continue
  const ids=new Set(selected.map(p=>p.id))
  const remaining=squad.filter(p=>!ids.has(p.id))
  const gks=remaining.filter(p=>p.position==='GK')
  const others=remaining.filter(p=>p.position!=='GK').sort((a,b)=>b.xfp-a.xfp||a.id-b.id)
  if(remaining.length!==4||gks.length!==1)continue
  const captain=[...selected].filter(p=>p.position!=='GK')
    .sort((a,b)=>b.xfp-a.xfp||a.id-b.id)[0]
  if(!captain)continue
  const base=selected.reduce((sum,p)=>sum+p.xfp,0)
  const benchTotal=remaining.reduce((sum,p)=>sum+p.xfp,0)
  ranked.push({
   key,starters:selected.map(p=>p.id),bench:[gks[0].id,...others.map(p=>p.id)],
   captain:captain.id,base,
   total:base+captain.xfp*(multiplier-1)+(benchBoost?benchTotal:0),
   captainMultiplier:multiplier,benchBoost
  })
 }
 return ranked.sort((a,b)=>b.total-a.total||a.key.localeCompare(b.key))
}
