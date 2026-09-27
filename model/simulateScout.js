const {attackWeights}=require('./attackAllocation');
const {SCORING}=require('../lib/rules.js');

const ROLE_FLOOR=.02;
const ROLE_CAP=.97;
const DURATION_90_CAP=.92;
const CONFIDENCE_WEIGHT={high:1,medium:.85,low:.6};
const DEFAULT_DC_RHO=-.08;

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const safeProbability=(v,fallback=.5)=>Number.isFinite(Number(v))?clamp(v,0,1):fallback;

function cardPoints(yellow,red){return red ? SCORING.red : yellow ? SCORING.yellow : 0;}

function adjustedRoleProbability(player){
  const raw=clamp(Number(player.role)||ROLE_FLOOR,ROLE_FLOOR,ROLE_CAP);
  const prior=clamp(Number(player.team_position_prior??raw),ROLE_FLOOR,ROLE_CAP);
  const w=CONFIDENCE_WEIGHT[String(player.confidence||'medium').toLowerCase()]??CONFIDENCE_WEIGHT.medium;
  return clamp(w*raw+(1-w)*prior,ROLE_FLOOR,ROLE_CAP);
}

function normalizedDurationDistribution(player){
  const durations=(player.durations||[75]).map(Number);
  const raw=(player.duration_weights||[1]).map(Number);
  while(raw.length<durations.length)raw.push(0);
  let total=raw.reduce((s,v)=>s+Math.max(0,v),0);
  if(total<=0){total=1;raw[0]=1;}
  const weights=raw.slice(0,durations.length).map(v=>Math.max(0,v)/total);
  const full=durations.map((d,i)=>d>=90?i:-1).filter(i=>i>=0);
  const fullMass=full.reduce((s,i)=>s+weights[i],0);
  if(fullMass>DURATION_90_CAP){
    const overflow=fullMass-DURATION_90_CAP;
    for(const i of full)weights[i]*=DURATION_90_CAP/fullMass;
    let mids=durations.map((d,i)=>d>=60&&d<90?i:-1).filter(i=>i>=0);
    if(!mids.length){durations.push(75);weights.push(0);mids=[weights.length-1];}
    const midMass=mids.reduce((s,i)=>s+weights[i],0);
    if(midMass>0)for(const i of mids)weights[i]+=overflow*(weights[i]/midMass);
    else for(const i of mids)weights[i]+=overflow/mids.length;
  }
  const norm=weights.reduce((s,v)=>s+v,0)||1;
  return {durations,weights:weights.map(v=>v/norm)};
}

function makeHistogram(){return {offset:-32,bins:new Int32Array(128),total:0,sum:0,sumSq:0};}
function addHistogram(hist,value){
  const score=Math.trunc(value);
  if(score<hist.offset||score>=hist.offset+hist.bins.length){
    let nextOffset=hist.offset,nextLength=hist.bins.length;
    while(score<nextOffset){nextOffset-=nextLength;nextLength*=2;}
    while(score>=nextOffset+nextLength)nextLength*=2;
    const next=new Int32Array(nextLength);next.set(hist.bins,hist.offset-nextOffset);
    hist.offset=nextOffset;hist.bins=next;
  }
  hist.bins[score-hist.offset]++;hist.total++;hist.sum+=value;hist.sumSq+=value*value;
}
function histogramValueAt(hist,index){
  let seen=0;
  for(let i=0;i<hist.bins.length;i++){const next=seen+hist.bins[i];if(index<next)return hist.offset+i;seen=next;}
  return 0;
}
function histogramQuantile(hist,fraction){
  if(!hist.total)return 0;
  const x=(hist.total-1)*fraction,lo=Math.floor(x),hi=Math.ceil(x);
  const a=histogramValueAt(hist,lo),b=histogramValueAt(hist,hi);
  return a+(b-a)*(x-lo);
}

function dixonColesTau(homeGoals,awayGoals,homeLambda,awayLambda,rho){
  if(homeGoals===0&&awayGoals===0)return 1-homeLambda*awayLambda*rho;
  if(homeGoals===0&&awayGoals===1)return 1+homeLambda*rho;
  if(homeGoals===1&&awayGoals===0)return 1+awayLambda*rho;
  if(homeGoals===1&&awayGoals===1)return 1-rho;
  return 1;
}

function fitDixonColesRho(history,fallback=DEFAULT_DC_RHO){
  const rows=(history||[]).map(row=>({
    hg:Number(row.home_goals),ag:Number(row.away_goals),
    hl:Number(row.home_lambda??row.home_xg),al:Number(row.away_lambda??row.away_xg),
  })).filter(r=>Number.isFinite(r.hg)&&Number.isFinite(r.ag)&&r.hl>0&&r.al>0);
  if(rows.length<12)return fallback;
  let best=fallback,bestLl=-Infinity;
  for(let rho=-.25;rho<=.15+1e-9;rho+=.005){
    let ll=0,ok=true;
    for(const r of rows){
      const tau=dixonColesTau(r.hg,r.ag,r.hl,r.al,rho);
      if(!(tau>0)){ok=false;break;}
      ll+=Math.log(tau);
    }
    if(ok&&ll>bestLl){bestLl=ll;best=Number(rho.toFixed(3));}
  }
  return best;
}

function allocateBonus(ids,base,minutes,bonus=SCORING.bonus){
  const active=ids.filter(i=>minutes[i]>0),out={};
  for(const i of active){
    const rank=1+active.reduce((n,j)=>n+(base[j]>base[i]?1:0),0);
    if(rank<=bonus.length)out[i]=bonus[rank-1];
  }
  return out;
}

function teamAssistFraction(input,club){
  const global=clamp(Number(input.assist_fraction??.7),0,1);
  const row=input.team_assist_fraction?.[String(club)]??input.team_assist_fraction?.[club];
  if(row===undefined||row===null)return global;
  const fraction=clamp(Number(typeof row==='object'?row.fraction:row),0,1);
  const sample=Math.max(0,Number(typeof row==='object'?row.matches:input.team_assist_samples?.[String(club)]||0));
  const w=sample/(sample+6);
  return w*fraction+(1-w)*global;
}

function redCardAdjustedLambdas(homeLambda,awayLambda,homeRedMinute=91,awayRedMinute=91){
  const cuts=[0,90];
  if(homeRedMinute>0&&homeRedMinute<90)cuts.push(homeRedMinute);
  if(awayRedMinute>0&&awayRedMinute<90)cuts.push(awayRedMinute);
  cuts.sort((a,b)=>a-b);
  const uniq=[...new Set(cuts)],segments=[];
  let h=0,a=0;
  for(let i=0;i<uniq.length-1;i++){
    const start=uniq[i],end=uniq[i+1],dur=end-start;
    const homeRed=homeRedMinute<=start,awayRed=awayRedMinute<=start;
    const hf=(homeRed?.75:1)*(awayRed?1.25:1),af=(awayRed?.75:1)*(homeRed?1.25:1);
    h+=homeLambda*hf*dur/90;a+=awayLambda*af*dur/90;
    segments.push({start,end,homeFactor:hf,awayFactor:af});
  }
  return {homeLambda:h,awayLambda:a,segments};
}

function simulateScout(input,count,seed,attackPolicy=true){
  const P=input.players,M=P.length,positions=['GK','DEF','MID','FWD'];
  const model=P.map(p=>({role:adjustedRoleProbability(p),duration:normalizedDurationDistribution(p)}));
  const allocation=P.map(p=>attackPolicy?attackWeights(p,input.playerMatches||[]):{
    goal:Math.max(1e-6,.8*p.rates[0]+.2*p.rates[1]),
    assist:Math.max(1e-6,.7*p.rates[3]+.3*p.rates[2]),
  });
  let state=seed>>>0;
  const random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const poisson=l=>{if(!(l>0))return 0;let n=0,t=1,L=Math.exp(-l);do{n++;t*=random();}while(t>L);return n-1;};
  const pick=(ids,weight)=>{
    if(!ids.length)return null;
    let sum=0;for(const i of ids)sum+=Math.max(0,weight(i));
    if(!(sum>0))return ids[Math.floor(random()*ids.length)];
    let u=random()*sum;for(const i of ids){u-=Math.max(0,weight(i));if(u<=0)return i;}return ids[ids.length-1];
  };
  const drawDuration=i=>{const d=model[i].duration;let u=random();for(let j=0;j<d.durations.length;j++){u-=d.weights[j];if(u<=0)return d.durations[j];}return d.durations[d.durations.length-1];};
  const drawDcScore=(hl,al,rho)=>{
    const maxTau=Math.max(1,dixonColesTau(0,0,hl,al,rho),dixonColesTau(0,1,hl,al,rho),dixonColesTau(1,0,hl,al,rho),dixonColesTau(1,1,hl,al,rho));
    for(let tries=0;tries<80;tries++){
      const hg=poisson(hl),ag=poisson(al),tau=dixonColesTau(hg,ag,hl,al,rho);
      if(tau>0&&random()<=tau/maxTau)return [hg,ag];
    }
    return [poisson(hl),poisson(al)];
  };
  const weightedGoalTime=(segments,side)=>{
    const key=side===0?'homeFactor':'awayFactor',weights=segments.map(s=>Math.max(0,(s.end-s.start)*s[key]));
    const idx=pick(weights.map((_,i)=>i),i=>weights[i]),s=segments[idx??0]||{start:0,end:90};
    return s.start+random()*(s.end-s.start);
  };

  const keys=['appearance','goals','assists','cs','saves','conceded','cards','penalties','own'];
  const result=P.map(p=>({...p,xi:0,play:0,p60:0,minutes:0,start_minutes:0,core:0,bonus:0,xfp:0,xgoal:0,xassist:0,p6:0,fixture_count:0,blank:false,components:Object.fromEntries(keys.map(k=>[k,0])),_hist:makeHistogram(),_starts:0,_startMinutes:0}));
  const clubIds=[...new Set(input.matches.flatMap(m=>[Number(m.home_id),Number(m.away_id)]).filter(Number.isFinite))];
  const teams=Object.fromEntries(clubIds.map(club=>[club,P.map((p,i)=>Number(p.club)===club?i:-1).filter(i=>i>=0)]));
  const quotas=Object.fromEntries((input.team_checks||[]).map(t=>[Number(t.club),t.formation]));
  const fixturesByClub=Object.fromEntries(clubIds.map(c=>[c,input.matches.filter(m=>Number(m.home_id)===c||Number(m.away_id)===c).length]));
  const rho=Number.isFinite(Number(input.rho))?clamp(Number(input.rho),-.3,.3):fitDixonColesRho(input.matchHistory||[],DEFAULT_DC_RHO);
  const saveBaseline=Math.max(.4,Number(input.save_lambda_baseline||1.35));

  const mins=new Int16Array(M),enter=new Int16Array(M),leave=new Int16Array(M),start=new Uint8Array(M),redFlag=new Uint8Array(M),weeklyFp=new Int16Array(M);

  for(let draw=0;draw<count;draw++){
    weeklyFp.fill(0);
    for(const match of input.matches){
      mins.fill(0);enter.fill(91);leave.fill(0);start.fill(0);redFlag.fill(0);
      const clubs=[Number(match.home_id),Number(match.away_id)];
      for(const c of clubs){
        const ids=teams[c]||[],used=new Set();
        for(const pos of positions){
          const k=Number(quotas[c]?.[pos]||0);if(!k)continue;
          const loc=ids.filter(i=>P[i].pos===pos);
          let available=loc.filter(i=>random()<safeProbability(P[i].avail,1));
          if(available.length<k)available=loc.filter(i=>Number(P[i].avail)>0);
          const rolePool=available.filter(i=>random()<model[i].role),pool=rolePool.length>=k?rolePool:available;
          const candidates=pool.map(i=>({i,key:Math.log(model[i].role/(1-model[i].role))/Math.max(.1,Number(input.temperature||1.7))-Math.log(-Math.log(Math.max(1e-12,random())))})).sort((a,b)=>b.key-a.key);
          if(candidates.length<k)throw Error('Yetersiz uygun oyuncu: '+c+' '+pos);
          for(const {i} of candidates.slice(0,k)){used.add(i);start[i]=1;enter[i]=0;leave[i]=P[i].pos==='GK'?90:drawDuration(i);}
        }
        let substitutions=0;
        for(const i of ids.filter(i=>start[i]).sort((a,b)=>leave[a]-leave[b])){
          if(leave[i]>=90)continue;
          const candidates=ids.filter(j=>Number(P[j].avail)>0&&!used.has(j)&&P[j].pos===P[i].pos&&P[j].pos!=='GK');
          if(substitutions>=5||!candidates.length){leave[i]=90;continue;}
          const j=pick(candidates,j=>P[j].benchw);enter[j]=leave[i];leave[j]=90;used.add(j);substitutions++;
        }
        for(const i of ids)mins[i]=Math.max(0,leave[i]-enter[i]);
        if(ids.reduce((s,i)=>s+start[i],0)!==11)throw Error('11 oyuncu kontrolü başarısız');
      }

      const firstRed=[91,91];
      for(let side=0;side<2;side++)for(const i of teams[clubs[side]]||[]){
        if(mins[i]<=0)continue;
        const exposure=mins[i]/90,pRed=Math.min(.15,Math.max(0,Number(P[i].rates?.[5]||0))*exposure);
        if(random()<pRed){
          const t=enter[i]+random()*Math.max(1,mins[i]);
          redFlag[i]=1;firstRed[side]=Math.min(firstRed[side],t);
          leave[i]=Math.min(leave[i],Math.ceil(t));mins[i]=Math.max(0,leave[i]-enter[i]);
        }
      }

      const adjusted=redCardAdjustedLambdas(Number(match.home_lambda||0),Number(match.away_lambda||0),firstRed[0],firstRed[1]);
      const score=drawDcScore(adjusted.homeLambda,adjusted.awayLambda,rho);
      const comp=Object.fromEntries(keys.map(k=>[k,new Int16Array(M)])),gc=new Int16Array(M);
      for(const i of (teams[clubs[0]]||[]).concat(teams[clubs[1]]||[]))comp.appearance[i]=(mins[i]>0?SCORING.appearance:0)+(mins[i]>60?SCORING.appearance_60:0);

      for(let side=0;side<2;side++){
        const ids=teams[clubs[side]]||[],opp=teams[clubs[1-side]]||[],assistFraction=teamAssistFraction(input,clubs[side]);
        for(let e=0;e<score[side];e++){
          const t=weightedGoalTime(adjusted.segments,side),on=ids.filter(i=>enter[i]<=t&&leave[i]>t),op=opp.filter(i=>enter[i]<=t&&leave[i]>t);
          for(const i of op)gc[i]++;
          if(!on.length)continue;
          const scorerCandidate=pick(on,i=>allocation[i].goal),own=random()<Number(input.own_fraction||0);
          let scorer=null;
          if(own&&op.length)comp.own[pick(op,()=>1)]+=SCORING.own_goal;
          else{scorer=scorerCandidate;comp.goals[scorer]+=SCORING.goal[P[scorer].pos];result[scorer].xgoal+=1/count;}
          const assistPool=scorer===null?on:on.filter(i=>i!==scorer);
          if(assistPool.length&&random()<assistFraction){
            const a=pick(assistPool,i=>allocation[i].assist);comp.assists[a]+=SCORING.assist;result[a].xassist+=1/count;
          }
        }
      }

      const both=(teams[clubs[0]]||[]).concat(teams[clubs[1]]||[]),base={};
      for(const i of both){
        const p=P[i],rates=p.rates||[],exposure=mins[i]/90;
        comp.cs[i]=mins[i]>=60&&gc[i]===0?SCORING.clean_sheet[p.pos]:0;
        if(SCORING.conceded_per_2[p.pos])comp.conceded[i]=Math.floor(gc[i]/2)*SCORING.conceded_per_2[p.pos];
        if(p.pos==='GK'){
          const oppLambda=Number(p.club)===clubs[0]?adjusted.awayLambda:adjusted.homeLambda,scale=clamp(oppLambda/saveBaseline,.5,1.8);
          comp.saves[i]=Math.floor(poisson(Math.max(0,Number(rates[6]||0))*exposure*scale)/3)*SCORING.saves_per_3;
        }
        const yc=random()<Math.min(.8,Math.max(0,Number(rates[4]||0))*exposure);
        comp.cards[i]=cardPoints(yc,Boolean(redFlag[i]));if(redFlag[i])comp.cs[i]=0;
        comp.penalties[i]=SCORING.penalty_miss*poisson(Math.max(0,Number(rates[7]||0))*exposure)+(p.pos==='GK'?SCORING.penalty_save*poisson(Math.max(0,Number(rates[8]||0))*exposure):0);
        base[i]=keys.reduce((s,k)=>s+comp[k][i],0);
      }
      const bon=allocateBonus(both,base,mins,SCORING.bonus);
      for(const i of both){
        const r=result[i],b=bon[i]||0,fp=base[i]+b;
        r._starts+=start[i];r.play+=(mins[i]>0?1:0)/count;r.p60+=(mins[i]>=60?1:0)/count;
        r.minutes+=mins[i]/count;r._startMinutes+=start[i]*mins[i];
        r.core+=base[i]/count;r.bonus+=b/count;r.xfp+=fp/count;weeklyFp[i]+=fp;
        for(const k of keys)r.components[k]+=comp[k][i]/count;
      }
    }
    for(let i=0;i<M;i++){addHistogram(result[i]._hist,weeklyFp[i]);result[i].p6+=(weeklyFp[i]>=6?1:0)/count;}
  }

  for(let i=0;i<M;i++){
    const r=result[i],fixtures=Number(fixturesByClub[Number(P[i].club)]||0);
    r.fixture_count=fixtures;r.blank=fixtures===0;
    r.xi=fixtures?Math.min(ROLE_CAP,r._starts/(count*fixtures)):0;
    r.play=fixtures?Math.min(1,r.play/fixtures):0;
    r.p60=fixtures?Math.min(1,r.p60/fixtures):0;
    r.minutes=fixtures?Math.min(88,r.minutes/fixtures):0;
    r.start_minutes=r._starts?r._startMinutes/r._starts:0;
    r.p25=histogramQuantile(r._hist,.25);r.p75=histogramQuantile(r._hist,.75);r.p90=histogramQuantile(r._hist,.9);
    if(r._hist.total){const mean=r._hist.sum/r._hist.total;r.std=Math.sqrt(Math.max(0,r._hist.sumSq/r._hist.total-mean*mean));r.mc_se=r.std/Math.sqrt(r._hist.total);}
    else{r.std=0;r.mc_se=0;}
    delete r._hist;delete r._starts;delete r._startMinutes;
    r.eligible=!r.blank&&r.avail>=.8&&r.valid_games>=1&&r.play>=.25;
  }
  return result;
}

module.exports={simulateScout,cardPoints,histogramQuantile,adjustedRoleProbability,normalizedDurationDistribution,dixonColesTau,fitDixonColesRho,allocateBonus,redCardAdjustedLambdas,teamAssistFraction,ROLE_CAP,DURATION_90_CAP,DEFAULT_DC_RHO};
