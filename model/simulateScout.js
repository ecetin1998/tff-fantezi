const {attackWeights}=require('./attackAllocation');
const {SCORING}=require('../lib/rules.js');

function cardPoints(yellow,red){
  // There is no separate second-yellow event in the simulator. A dismissal
  // always receives the official -3 red-card deduction, not -1 plus -3.
  return red ? SCORING.red : yellow ? SCORING.yellow : 0;
}

function makeHistogram(){
  return {offset:-32,bins:new Int32Array(128),total:0,sum:0,sumSq:0};
}

function addHistogram(hist,value){
  const score=Math.trunc(value);
  if(score<hist.offset || score>=hist.offset+hist.bins.length){
    let nextOffset=hist.offset;
    let nextLength=hist.bins.length;
    while(score<nextOffset){nextOffset-=nextLength;nextLength*=2;}
    while(score>=nextOffset+nextLength)nextLength*=2;
    const next=new Int32Array(nextLength);
    next.set(hist.bins,hist.offset-nextOffset);
    hist.offset=nextOffset;
    hist.bins=next;
  }
  hist.bins[score-hist.offset]++;
  hist.total++;
  hist.sum+=value;
  hist.sumSq+=value*value;
}

function histogramValueAt(hist,index){
  let seen=0;
  for(let i=0;i<hist.bins.length;i++){
    const next=seen+hist.bins[i];
    if(index<next)return hist.offset+i;
    seen=next;
  }
  return 0;
}

function histogramQuantile(hist,fraction){
  if(!hist.total)return 0;
  const x=(hist.total-1)*fraction;
  const lo=Math.floor(x),hi=Math.ceil(x);
  const a=histogramValueAt(hist,lo),b=histogramValueAt(hist,hi);
  return a+(b-a)*(x-lo);
}

function matchKey(match,index){
  return String(match.match_id ?? match.id ?? (String(match.home_id)+'-'+String(match.away_id)+'-'+index));
}

function goalkeeperSaveRate(per90Saves){
  // Opponent goal expectation drives shot volume; the keeper's historical
  // save volume only makes a bounded skill adjustment to the conversion rate.
  return Math.max(.55,Math.min(.82,.68+.025*(Number(per90Saves||0)-3)));
}

function expectedKeeperSaves(opponentGoalLambda,per90Saves,exposure=1){
  const saveRate=goalkeeperSaveRate(per90Saves);
  const goalLambda=Math.max(.05,Number(opponentGoalLambda)||0);
  const opponentSot=goalLambda/Math.max(.12,1-saveRate);
  return Math.max(0,opponentSot*saveRate*Math.max(0,exposure));
}

function redCardExitMinute(enter,leave,u){
  const start=Math.max(0,Number(enter)||0),end=Math.max(start+1,Number(leave)||90);
  const draw=Math.max(0,Math.min(.999999999,Number(u)||0));
  return Math.max(start+1,Math.min(end-1,Math.floor(start+draw*(end-start))));
}

function isActiveAt(enter,leave,minute){
  return Number(enter)<=Number(minute)&&Number(leave)>Number(minute);
}

function bonusByCompetitionRank(ids,base,minutes){
  const ordered=ids.filter(i=>minutes[i]>0).sort((a,b)=>base[b]-base[a]||a-b);
  const bonus={};
  let previousScore=null,rank=-1;
  for(let index=0;index<ordered.length;index++){
    const i=ordered[index],score=base[i];
    if(previousScore===null||score!==previousScore)rank=index;
    previousScore=score;
    if(rank>=SCORING.bonus.length)break;
    bonus[i]=SCORING.bonus[rank];
  }
  return bonus;
}

function simulateScout(input,count,seed,attackPolicy=true){
  const P=input.players,M=P.length,positions=['GK','DEF','MID','FWD'];
  const allocation=P.map(p=>attackPolicy?attackWeights(p,input.playerMatches||[]):{
    goal:Math.max(1e-6,.8*p.rates[0]+.2*p.rates[1]),
    // rates[2] = observed assists/90, rates[3] = xA/90.
    assist:Math.max(1e-6,.7*p.rates[3]+.3*p.rates[2]),
  });

  let state=seed>>>0;
  const random=()=>{
    state=(state+0x6D2B79F5)>>>0;
    let t=state;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
  const poisson=l=>{
    l=Math.max(0,Number(l)||0);
    if(l===0)return 0;
    let n=0,t=1,L=Math.exp(-l);
    do{n++;t*=random();}while(t>L);
    return n-1;
  };
  const pick=(ids,weight)=>{
    if(!ids.length)return null;
    let sum=0;for(const i of ids)sum+=Math.max(0,weight(i));
    if(sum<=0)return ids[Math.floor(random()*ids.length)];
    let u=random()*sum;
    for(const i of ids){u-=Math.max(0,weight(i));if(u<=0)return i;}
    return ids[ids.length-1];
  };
  const drawDuration=p=>{
    let u=random();
    for(let j=0;j<p.durations.length;j++){u-=p.duration_weights[j];if(u<=0)return p.durations[j];}
    return p.durations[p.durations.length-1];
  };

  const keys=['appearance','goals','assists','cs','saves','conceded','cards','penalties','own'];
  const result=P.map(p=>({...p,xi:0,play:0,p60:0,minutes:0,start_minutes:0,core:0,bonus:0,xfp:0,xgoal:0,xassist:0,p6:0,match_xi:{},components:Object.fromEntries(keys.map(k=>[k,0])),_hist:makeHistogram()}));
  const clubIds=[...new Set(input.matches.flatMap(m=>[Number(m.home_id),Number(m.away_id)]).filter(Number.isFinite))];
  const teams=Object.fromEntries(clubIds.map(club=>[club,P.map((p,i)=>Number(p.club)===club?i:-1).filter(i=>i>=0)]));
  const quotas=Object.fromEntries(input.team_checks.map(t=>[Number(t.club),t.formation]));

  function drawTeamLineup(club,mins,enter,leave,start){
    const ids=teams[club]||[];
    const available=new Set(ids.filter(i=>random()<P[i].avail));
    const used=new Set();
    for(const pos of positions){
      const k=quotas[club]?.[pos]||0;
      if(!k)continue;
      const loc=ids.filter(i=>P[i].pos===pos);
      if(loc.filter(i=>available.has(i)).length<k){
        for(const i of loc)if(P[i].avail>0)available.add(i);
      }
      const candidates=loc.filter(i=>available.has(i)).map(i=>({
        i,key:Math.log(P[i].role/(1-P[i].role))/input.temperature-Math.log(-Math.log(Math.max(1e-12,random())))
      })).sort((a,b)=>b.key-a.key);
      if(candidates.length<k)throw Error('Yetersiz uygun oyuncu: '+club+' '+pos);
      for(const {i} of candidates.slice(0,k)){
        used.add(i);start[i]=1;enter[i]=0;
        leave[i]=P[i].pos==='GK'?90:drawDuration(P[i]);
      }
    }
    let substitutions=0;
    for(const i of ids.filter(i=>start[i]).sort((a,b)=>leave[a]-leave[b])){
      if(leave[i]>=90)continue;
      const candidates=ids.filter(j=>available.has(j)&&!used.has(j)&&P[j].pos===P[i].pos&&P[j].pos!=='GK');
      if(substitutions>=5||!candidates.length){leave[i]=90;continue;}
      const j=pick(candidates,j=>P[j].benchw);
      enter[j]=leave[i];leave[j]=90;used.add(j);substitutions++;
    }
    for(const i of ids)mins[i]=Math.max(0,leave[i]-enter[i]);
    if(ids.reduce((s,i)=>s+mins[i],0)!==990||ids.reduce((s,i)=>s+start[i],0)!==11){
      throw Error('990 dakika / 11 oyuncu kontrolü başarısız');
    }
  }

  for(let draw=0;draw<count;draw++){
    const weeklyCore=new Float64Array(M),weeklyBonus=new Float64Array(M),weeklyFP=new Float64Array(M);
    const weeklyMinutes=new Float64Array(M),weeklyStartMinutes=new Float64Array(M);
    const weeklyComponents=Object.fromEntries(keys.map(k=>[k,new Float64Array(M)]));
    const startedAny=new Uint8Array(M),playedAny=new Uint8Array(M),p60Any=new Uint8Array(M);

    for(let matchIndex=0;matchIndex<input.matches.length;matchIndex++){
      const match=input.matches[matchIndex];
      const clubs=[Number(match.home_id),Number(match.away_id)];
      const both=(teams[clubs[0]]||[]).concat(teams[clubs[1]]||[]);
      const mins=new Int16Array(M),enter=new Int16Array(M).fill(91),leave=new Int16Array(M),start=new Uint8Array(M);

      // A DGW is two separate football matches: redraw XI and minutes for each.
      drawTeamLineup(clubs[0],mins,enter,leave,start);
      drawTeamLineup(clubs[1],mins,enter,leave,start);

      const comp=Object.fromEntries(keys.map(k=>[k,new Int16Array(M)]));
      // Discipline is drawn before scoring events so a dismissed player cannot
      // score or assist after the dismissal minute.
      for(const i of both){
        const scheduledExposure=mins[i]/90;
        if(mins[i]<=0)continue;
        const yc=random()<Math.min(.8,Math.max(0,P[i].rates[4]*scheduledExposure));
        const rc=random()<Math.min(.15,Math.max(0,P[i].rates[5]*scheduledExposure));
        comp.cards[i]=cardPoints(yc,rc);
        if(rc){
          leave[i]=redCardExitMinute(enter[i],leave[i],random());
          mins[i]=Math.max(0,leave[i]-enter[i]);
        }
        comp.appearance[i]=(mins[i]>0?SCORING.appearance:0)+(mins[i]>60?SCORING.appearance_60:0);
      }

      const score=[poisson(match.home_lambda),poisson(match.away_lambda)];
      const gc=new Int16Array(M);
      for(let side=0;side<2;side++){
        const ids=teams[clubs[side]]||[],opp=teams[clubs[1-side]]||[];
        for(let e=0;e<score[side];e++){
          const t=random()*90;
          const on=ids.filter(i=>isActiveAt(enter[i],leave[i],t));
          const op=opp.filter(i=>isActiveAt(enter[i],leave[i],t));
          for(const i of op)gc[i]++;
          if(!on.length)continue;
          const scorerCandidate=pick(on,i=>allocation[i].goal);
          const own=random()<input.own_fraction;
          let scorer=null;
          if(own&&op.length){
            const ownScorer=pick(op,()=>1);
            if(ownScorer!==null)comp.own[ownScorer]+=SCORING.own_goal;
          }else if(scorerCandidate!==null){
            scorer=scorerCandidate;
            comp.goals[scorer]+=SCORING.goal[P[scorer].pos];
            result[scorer].xgoal+=1/count;
          }
          const assistPool=scorer===null?on:on.filter(i=>i!==scorer);
          if(assistPool.length&&random()<input.assist_fraction){
            const a=pick(assistPool,i=>allocation[i].assist);
            if(a!==null){
              comp.assists[a]+=SCORING.assist;
              result[a].xassist+=1/count;
            }
          }
        }
      }

      const base={};
      for(const i of both){
        const p=P[i],rates=p.rates,exposure=mins[i]/90;
        const opponentLambda=Number(p.club)===clubs[0]?Number(match.away_lambda):Number(match.home_lambda);
        // Official rule: clean sheet is a match-level team outcome plus >=60 minutes.
        comp.cs[i]=mins[i]>=60&&score[Number(p.club)===clubs[0]?1:0]===0?SCORING.clean_sheet[p.pos]:0;
        if(SCORING.conceded_per_2[p.pos])comp.conceded[i]=Math.floor(gc[i]/2)*SCORING.conceded_per_2[p.pos];
        if(p.pos==='GK'){
          const saveLambda=expectedKeeperSaves(opponentLambda,rates[6],exposure);
          comp.saves[i]=Math.floor(poisson(saveLambda)/3)*SCORING.saves_per_3;
        }
        const penaltyPressure=Math.max(.25,Math.min(3,opponentLambda/1.35));
        comp.penalties[i]=SCORING.penalty_miss*poisson(rates[7]*exposure)
          +(p.pos==='GK'?SCORING.penalty_save*poisson(rates[8]*exposure*penaltyPressure):0);
        base[i]=keys.reduce((sum,k)=>sum+comp[k][i],0);
      }

      const bon=bonusByCompetitionRank(both,base,mins);
      const key=matchKey(match,matchIndex);
      for(const i of both){
        const b=bon[i]||0,fp=base[i]+b;
        startedAny[i]=Math.max(startedAny[i],start[i]);
        playedAny[i]=Math.max(playedAny[i],mins[i]>0?1:0);
        p60Any[i]=Math.max(p60Any[i],mins[i]>=60?1:0);
        weeklyMinutes[i]+=mins[i];
        weeklyStartMinutes[i]+=start[i]*mins[i];
        weeklyCore[i]+=base[i];
        weeklyBonus[i]+=b;
        weeklyFP[i]+=fp;
        result[i].match_xi[key]=(result[i].match_xi[key]||0)+start[i]/count;
        for(const k of keys)weeklyComponents[k][i]+=comp[k][i];
      }
    }

    // Quantiles and 6+ refer to the whole match week, not one fixture inside a DGW.
    for(let i=0;i<M;i++){
      const r=result[i],fp=weeklyFP[i];
      r.xi+=startedAny[i]/count;
      r.play+=playedAny[i]/count;
      r.p60+=p60Any[i]/count;
      r.minutes+=weeklyMinutes[i]/count;
      r.start_minutes+=weeklyStartMinutes[i]/count;
      r.core+=weeklyCore[i]/count;
      r.bonus+=weeklyBonus[i]/count;
      r.xfp+=fp/count;
      r.p6+=(fp>=6?1:0)/count;
      addHistogram(r._hist,fp);
      for(const k of keys)r.components[k]+=weeklyComponents[k][i]/count;
    }
  }

  for(const r of result){
    r.start_minutes=r.xi?r.start_minutes/r.xi:0;
    r.p25=histogramQuantile(r._hist,.25);
    r.p75=histogramQuantile(r._hist,.75);
    r.p90=histogramQuantile(r._hist,.9);
    if(r._hist.total){
      const mean=r._hist.sum/r._hist.total;
      r.std=Math.sqrt(Math.max(0,r._hist.sumSq/r._hist.total-mean*mean));
      r.mc_se=r.std/Math.sqrt(r._hist.total);
    }else{
      r.std=0;r.mc_se=0;
    }
    delete r._hist;
    r.eligible=r.avail>=.8&&r.valid_games>=1&&r.play>=.25;
  }
  return result;
}

module.exports={
  simulateScout,cardPoints,histogramQuantile,
  expectedKeeperSaves,goalkeeperSaveRate,bonusByCompetitionRank,redCardExitMinute,isActiveAt
};
