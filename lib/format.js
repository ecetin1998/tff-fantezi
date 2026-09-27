export function largestRemainderPercentages(values=[]){
  const numbers=values.map(value=>Math.max(0,Number(value)||0))
  const sum=numbers.reduce((total,value)=>total+value,0)
  if(sum<=0)return numbers.map(()=>0)

  const raw=numbers.map(value=>value/sum*100)
  const rounded=raw.map(value=>Math.floor(value))
  let remaining=100-rounded.reduce((total,value)=>total+value,0)
  const order=raw.map((value,index)=>({index,remainder:value-Math.floor(value)}))
    .sort((a,b)=>b.remainder-a.remainder||a.index-b.index)

  for(let i=0;i<remaining;i++)rounded[order[i%order.length].index]+=1
  return rounded
}

export function outcomePercentages(match){
  return largestRemainderPercentages([
    match?.home_win_probability,
    match?.draw_probability,
    match?.away_win_probability,
  ])
}
