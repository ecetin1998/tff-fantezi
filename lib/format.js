export function largestRemainderPercentages(values){
  const nums=(values||[]).map(v=>Math.max(0,Number(v)||0))
  const total=nums.reduce((sum,v)=>sum+v,0)
  if(!nums.length)return []
  if(total<=0){
    const base=Math.floor(100/nums.length)
    const out=nums.map(()=>base)
    for(let i=0;i<100-base*nums.length;i++)out[i]+=1
    return out
  }
  const scaled=nums.map(v=>v/total*100)
  const floors=scaled.map(Math.floor)
  let remaining=100-floors.reduce((sum,v)=>sum+v,0)
  const order=scaled.map((v,i)=>({i,remainder:v-floors[i]}))
    .sort((a,b)=>b.remainder-a.remainder||a.i-b.i)
  for(let i=0;i<remaining;i++)floors[order[i%order.length].i]+=1
  return floors
}

export function roundOneXTwo(home,draw,away){
  const [homePct,drawPct,awayPct]=largestRemainderPercentages([home,draw,away])
  return {home:homePct,draw:drawPct,away:awayPct}
}
