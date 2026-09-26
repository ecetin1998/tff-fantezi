const {attackWeights}=require('./attackAllocation');

function simulateScout(input, count, seed, attackPolicy = true) {
  const P=input.players, M=P.length, positions=['GK','DEF','MID','FWD'];
  const allocation=P.map(p=>attackPolicy ? attackWeights(p,input.playerMatches||[]) : {
    goal:Math.max(1e-6,.8*p.rates[0]+.2*p.rates[1]),
    assist:Math.max(1e-6,.7*p.rates[3]+.3*p.rates[2]),
  });
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296;};
  const poisson=l=>{let n=0,t=1,L=Math.exp(-l);do{n++;t*=random();}while(t>L);return n-1;};
  const pick=(ids,weight)=>{let sum=0;for(const i of ids)sum+=weight(i);let u=random()*sum;for(const i of ids){u-=weight(i);if(u<=0)return i;}return ids[ids.length-1];};
  const drawDuration=p=>{let u=random();for(let j=0;j<p.durations.length;j++){u-=p.duration_weights[j];if(u<=0)return p.durations[j];}return p.durations[p.durations.length-1];};
  const keys=['appearance','goals','assists','cs','saves','conceded','cards','penalties','own'];
  const result=P.map(p=>({...p,xi:0,play:0,p60:0,minutes:0,start_minutes:0,core:0,bonus:0,xfp:0,xgoal:0,xassist:0,p6:0,components:Object.fromEntries(keys.map(k=>[k,0])),distribution:[]}));
  const teams={};for(let c=1;c<=18;c++)teams[c]=P.map((p,i)=>p.club===c?i:-1).filter(i=>i>=0);
  const quotas=Object.fromEntries(input.team_checks.map(t=>[t.club,t.formation]));
  for(let draw=0;draw<count;draw++){
    const mins=new Int16Array(M),enter=new Int16Array(M).fill(91),leave=new Int16Array(M),start=new Uint8Array(M);
    for(let c=1;c<=18;c++){
      const ids=teams[c], available=new Set(ids.filter(i=>random()<P[i].avail)), used=new Set();
      for(const pos of positions){
        const k=quotas[c][pos]||0;if(!k)continue;
        const loc=ids.filter(i=>P[i].pos===pos);if(loc.filter(i=>available.has(i)).length<k)for(const i of loc)if(P[i].avail>0)available.add(i);
        const candidates=loc.filter(i=>available.has(i)).map(i=>({i,key:Math.log(P[i].role/(1-P[i].role))/input.temperature-Math.log(-Math.log(random()))})).sort((a,b)=>b.key-a.key);
        if(candidates.length<k)throw Error('Yetersiz uygun oyuncu: '+c+' '+pos);
        for(const {i} of candidates.slice(0,k)){used.add(i);start[i]=1;enter[i]=0;leave[i]=P[i].pos==='GK'?90:drawDuration(P[i]);}
      }
      let substitutions=0;
      for(const i of ids.filter(i=>start[i]).sort((a,b)=>leave[a]-leave[b])){
        if(leave[i]>=90)continue;
        const candidates=ids.filter(j=>available.has(j)&&!used.has(j)&&P[j].pos===P[i].pos&&P[j].pos!=='GK');
        if(substitutions>=5||!candidates.length){leave[i]=90;continue;}
        const j=pick(candidates,j=>P[j].benchw);enter[j]=leave[i];leave[j]=90;used.add(j);substitutions++;
      }
      for(const i of ids)mins[i]=Math.max(0,leave[i]-enter[i]);
      if(ids.reduce((s,i)=>s+mins[i],0)!==990||ids.reduce((s,i)=>s+start[i],0)!==11)throw Error('990 dakika / 11 oyuncu kontrolü başarısız');
    }
    const comp=Object.fromEntries(keys.map(k=>[k,new Int16Array(M)]));
    for(let i=0;i<M;i++)comp.appearance[i]=(mins[i]>0?1:0)+(mins[i]>60?1:0);
    for(const match of input.matches){
      const clubs=[match.home_id,match.away_id], score=[poisson(match.home_lambda),poisson(match.away_lambda)], gc=new Int16Array(M);
      for(let side=0;side<2;side++){
        const ids=teams[clubs[side]],opp=teams[clubs[1-side]];
        for(let e=0;e<score[side];e++){
          const t=random()*90,on=ids.filter(i=>enter[i]<=t&&leave[i]>t),op=opp.filter(i=>enter[i]<=t&&leave[i]>t);
          for(const i of op)gc[i]++;
          const scorer=pick(on,i=>allocation[i].goal),own=random()<input.own_fraction;
          if(own)comp.own[pick(op,()=>1)]-=2;
          else{comp.goals[scorer]+={GK:10,DEF:6,MID:5,FWD:4}[P[scorer].pos];result[scorer].xgoal+=1/count;}
          if(random()<input.assist_fraction){const a=pick(on.filter(i=>i!==scorer),i=>allocation[i].assist);comp.assists[a]+=3;result[a].xassist+=1/count;}
        }
      }
      const both=teams[clubs[0]].concat(teams[clubs[1]]),base={};
      for(const i of both){
        const p=P[i],rates=p.rates,exposure=mins[i]/90;
        comp.cs[i]=mins[i]>=60&&gc[i]===0?({GK:4,DEF:4,MID:1,FWD:0}[p.pos]):0;
        if(p.pos==='GK'||p.pos==='DEF')comp.conceded[i]=-Math.floor(gc[i]/2);
        if(p.pos==='GK')comp.saves[i]=Math.floor(poisson(rates[6]*exposure)/3);
        const yc=random()<Math.min(.8,rates[4]*exposure),rc=random()<Math.min(.15,rates[5]*exposure);
        comp.cards[i]=-(yc?1:0)-(rc?3:0);if(rc)comp.cs[i]=0;
        comp.penalties[i]=-2*poisson(rates[7]*exposure)+(p.pos==='GK'?5*poisson(rates[8]*exposure):0);
        base[i]=keys.reduce((s,k)=>s+comp[k][i],0);
      }
      const scores=[...new Set(both.filter(i=>mins[i]>0).map(i=>base[i]))].sort((a,b)=>b-a),bon={};let awarded=0;
      for(let g=0;g<3&&g<scores.length&&awarded<3;g++){
        const winners=both.filter(i=>mins[i]>0&&base[i]===scores[g]);for(const i of winners)bon[i]=3-g;awarded+=winners.length;
      }
      for(const i of both){
        const r=result[i],b=bon[i]||0,fp=base[i]+b;
        r.xi+=start[i]/count;r.play+=(mins[i]>0?1:0)/count;r.p60+=(mins[i]>=60?1:0)/count;r.minutes+=mins[i]/count;r.start_minutes+=start[i]*mins[i]/count;
        r.core+=base[i]/count;r.bonus+=b/count;r.xfp+=fp/count;r.p6+=(fp>=6?1:0)/count;r.distribution.push(fp);
        for(const k of keys)r.components[k]+=comp[k][i]/count;
      }
    }
  }
  for(const r of result){
    r.start_minutes=r.xi?r.start_minutes/r.xi:0;r.distribution.sort((a,b)=>a-b);
    const q=f=>{const x=(count-1)*f,a=Math.floor(x);return r.distribution[a]+(r.distribution[Math.ceil(x)]-r.distribution[a])*(x-a);};
    r.p25=q(.25);r.p75=q(.75);r.p90=q(.9);r.std=Math.sqrt(r.distribution.reduce((s,v)=>s+(v-r.xfp)**2,0)/count);r.mc_se=r.std/Math.sqrt(count);delete r.distribution;
    r.eligible=r.avail>=.8&&r.valid_games>=1&&r.play>=.25;
  }
  return result;
}

module.exports={simulateScout};
