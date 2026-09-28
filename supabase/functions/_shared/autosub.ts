type PlayerRow={
  player_id:number|string;
  position:string;
  price:number|string;
  team_id:number|string;
  xfp:number|string;
  appearance_probability?:number|string|null;
  availability_probability?:number|string|null;
  xi_probability?:number|string|null;
  x_minutes?:number|string|null;
};

const POSITIONS=["GK","DEF","MID","FWD"] as const;

function num(value:any){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:0;
}

function clamp01(value:number){
  return Math.max(0,Math.min(1,value));
}

export function playProbability(player:PlayerRow){
  if(player.appearance_probability!==null&&player.appearance_probability!==undefined){
    return clamp01(num(player.appearance_probability));
  }
  const xi=num(player.xi_probability);
  const minutes=num(player.x_minutes);
  const availability=player.availability_probability===null||player.availability_probability===undefined
    ?1:num(player.availability_probability);
  return clamp01(availability*Math.max(xi,Math.min(1,minutes/90)));
}

function conditionalXfp(player:PlayerRow){
  const probability=playProbability(player);
  return probability>1e-9?num(player.xfp)/probability:0;
}

function formationKey(counts:Record<string,number>,formations:string[]){
  if(num(counts.GK)!==1)return null;
  const key=`${num(counts.DEF)}-${num(counts.MID)}-${num(counts.FWD)}`;
  return formations.includes(key)?key:null;
}

function starterAbsenceDistribution(xi:PlayerRow[]){
  let distribution=new Map<string,number>([["0,0,0,0",1]]);
  for(const player of xi){
    const posIndex=POSITIONS.indexOf(player.position as any);
    if(posIndex<0)continue;
    const noPlay=1-playProbability(player);
    const next=new Map<string,number>();
    for(const [key,probability] of distribution){
      const state=key.split(",").map(Number);
      next.set(key,(next.get(key)||0)+probability*(1-noPlay));
      const absent=[...state];absent[posIndex]+=1;
      const absentKey=absent.join(",");
      next.set(absentKey,(next.get(absentKey)||0)+probability*noPlay);
    }
    distribution=next;
  }
  return distribution;
}

export function expectedAutosubValue(xi:PlayerRow[],orderedBench:PlayerRow[],formations:string[]){
  if(xi.length!==11||orderedBench.length!==4)return 0;
  const counts:Record<string,number>={GK:0,DEF:0,MID:0,FWD:0};
  for(const player of xi)counts[player.position]=(counts[player.position]||0)+1;
  if(!formationKey(counts,formations))return 0;

  const goalkeeper=orderedBench.find(player=>player.position==="GK");
  const outfield=orderedBench.filter(player=>player.position!=="GK");
  if(!goalkeeper||outfield.length!==3)return 0;
  const bench=[goalkeeper,...outfield];
  const play=bench.map(playProbability);
  const conditional=bench.map(conditionalXfp);
  let total=0;

  for(const [stateKey,starterProbability] of starterAbsenceDistribution(xi)){
    if(starterProbability<=0)continue;
    const state=stateKey.split(",").map(Number);
    const absent:Record<string,number>=Object.fromEntries(POSITIONS.map((pos,index)=>[pos,state[index]||0]));
    for(let mask=0;mask<16;mask++){
      let probability=starterProbability;
      const played:boolean[]=[];
      for(let i=0;i<4;i++){
        const isPlaying=Boolean(mask&(1<<i));
        probability*=isPlaying?play[i]:(1-play[i]);
        played.push(isPlaying);
      }
      if(probability<=0)continue;
      let value=0;
      if(absent.GK>0&&played[0])value+=conditional[0];

      const missing:Record<string,number>={
        DEF:absent.DEF||0,MID:absent.MID||0,FWD:absent.FWD||0
      };
      let current={...counts};
      outfield.forEach((player,index)=>{
        const benchIndex=index+1;
        if(!played[benchIndex]||missing.DEF+missing.MID+missing.FWD<=0)return;
        const candidates=[player.position,"DEF","MID","FWD"];
        const seen=new Set<string>();
        for(const replacedPos of candidates){
          if(seen.has(replacedPos)||!missing[replacedPos])continue;
          seen.add(replacedPos);
          const trial={...current};
          trial[replacedPos]-=1;
          trial[player.position]=(trial[player.position]||0)+1;
          if(formationKey(trial,formations)){
            current=trial;
            missing[replacedPos]-=1;
            value+=conditional[benchIndex];
            break;
          }
        }
      });
      total+=probability*value;
    }
  }
  return total;
}

function permutations3<T>(rows:T[]){
  if(rows.length!==3)return [rows];
  return [
    [rows[0],rows[1],rows[2]],[rows[0],rows[2],rows[1]],
    [rows[1],rows[0],rows[2]],[rows[1],rows[2],rows[0]],
    [rows[2],rows[0],rows[1]],[rows[2],rows[1],rows[0]]
  ];
}

export function bestBenchOrder(xi:PlayerRow[],bench:PlayerRow[],formations:string[]){
  const goalkeeper=bench.find(player=>player.position==="GK");
  const outfield=bench.filter(player=>player.position!=="GK");
  if(!goalkeeper||outfield.length!==3)return {bench:[...bench],autosubEv:0};
  let best=[goalkeeper,...outfield],bestValue=-1;
  for(const order of permutations3(outfield)){
    const candidate=[goalkeeper,...order];
    const value=expectedAutosubValue(xi,candidate,formations);
    if(value>bestValue+1e-12){best=candidate;bestValue=value}
  }
  return {bench:best,autosubEv:bestValue};
}

function legalSquad(xi:PlayerRow[],bench:PlayerRow[],rules:any){
  const squad=[...xi,...bench];
  const limits=rules.squad||{};
  if(squad.length!==Object.values(limits).reduce((sum:number,value:any)=>sum+num(value),0))return false;
  const counts:Record<string,number>={GK:0,DEF:0,MID:0,FWD:0};
  const clubs=new Map<number,number>();
  let budget=0;
  for(const player of squad){
    counts[player.position]=(counts[player.position]||0)+1;
    budget+=num(player.price);
    const club=num(player.team_id);
    clubs.set(club,(clubs.get(club)||0)+1);
  }
  for(const pos of POSITIONS)if(num(counts[pos])!==num(limits[pos]))return false;
  if(budget>num(rules.budget)+1e-6)return false;
  if(Math.max(0,...clubs.values())>num(rules.max_per_club||3))return false;
  return true;
}

function benchCandidateShortlist(
  xi:PlayerRow[],
  bench:PlayerRow[],
  candidates:PlayerRow[],
){
  const xiIds=new Set(xi.map(player=>num(player.player_id)));
  const keep=new Map<number,PlayerRow>();
  const add=(player:PlayerRow)=>{
    const id=num(player.player_id);
    if(!xiIds.has(id))keep.set(id,player);
  };
  bench.forEach(add);
  for(const pos of POSITIONS){
    const pool=candidates.filter(player=>player.position===pos&&!xiIds.has(num(player.player_id)));
    [...pool]
      .sort((a,b)=>num(b.xfp)-num(a.xfp)||playProbability(b)-playProbability(a)||num(a.price)-num(b.price))
      .slice(0,5)
      .forEach(add);
    [...pool]
      .sort((a,b)=>num(a.price)-num(b.price)||num(b.xfp)-num(a.xfp))
      .slice(0,5)
      .forEach(add);
  }
  return [...keep.values()];
}

export function optimizeBenchForAutosubs(xi:PlayerRow[],bench:PlayerRow[],candidates:PlayerRow[],rules:any){
  const formations=Array.isArray(rules.formations)?rules.formations.map(String):[];
  const shortlist=benchCandidateShortlist(xi,bench,candidates);
  const cache=new Map<string,{bench:PlayerRow[],autosubEv:number}>();
  const evaluate=(trial:PlayerRow[])=>{
    const key=trial.map(player=>num(player.player_id)).sort((a,b)=>a-b).join(',');
    const cached=cache.get(key);
    if(cached)return cached;
    const result=bestBenchOrder(xi,trial,formations);
    cache.set(key,result);
    return result;
  };
  let current=evaluate(bench);
  for(let iteration=0;iteration<4;iteration++){
    let best=current;
    let bestCost=current.bench.reduce((sum,p)=>sum+num(p.price),0);
    const selected=new Set([...xi,...current.bench].map(p=>num(p.player_id)));
    for(let slot=0;slot<current.bench.length;slot++){
      const old=current.bench[slot];
      for(const candidate of shortlist){
        const candidateId=num(candidate.player_id);
        if(candidate.position!==old.position||selected.has(candidateId))continue;
        const trial=[...current.bench];trial[slot]=candidate;
        if(!legalSquad(xi,trial,rules))continue;
        const ordered=evaluate(trial);
        const cost=ordered.bench.reduce((sum,p)=>sum+num(p.price),0);
        if(
          ordered.autosubEv>best.autosubEv+1e-9||
          (Math.abs(ordered.autosubEv-best.autosubEv)<=1e-9&&cost<bestCost-1e-9)
        ){
          best=ordered;bestCost=cost;
        }
      }
    }
    const same=best.bench.every((player,index)=>num(player.player_id)===num(current.bench[index]?.player_id));
    current=best;
    if(same)break;
  }
  return current;
}
