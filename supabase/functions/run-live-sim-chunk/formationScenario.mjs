// Sampling is restricted to TWO different, complete, source-verified
// previous first XIs. Fantasy registration positions, never tactical guesses.
const POSITIONS=["GK","DEF","MID","FWD"];
const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
export function validRegisteredFormation(formation,eligibleCounts={}){
  if(!formation||typeof formation!=="object"||Array.isArray(formation))return false;
  let total=0;
  for(const pos of POSITIONS){
    const n=formation[pos]===undefined?0:Number(formation[pos]);
    if(!Number.isInteger(n)||n<0||n>11)return false;
    if(eligibleCounts[pos]!==undefined&&(!finite(eligibleCounts[pos])||n>Number(eligibleCounts[pos])))return false;
    total+=n;
  }
  return Number(formation.GK)===1&&total===11;
}
export function selectVerifiedFormation(base,options,random=Math.random,eligibleCounts={}){
  if(!Array.isArray(options)||options.length!==2)return base;
  const weeks=new Set(options.map(x=>Number(x?.evidence_week)));
  if(weeks.size!==2||[...weeks].some(w=>!Number.isInteger(w)))return base;
  if(options.some(x=>!validRegisteredFormation(x?.formation,eligibleCounts)||
      !finite(x.weight)||Number(x.weight)<=0))return base;
  const total=options.reduce((sum,x)=>sum+Number(x.weight),0);
  if(!Number.isFinite(total)||total<=0)return base;
  const u=Math.max(0,Math.min(.999999999,Number(random())||0))*total;
  return (u<Number(options[0].weight)?options[0]:options[1]).formation;
}
