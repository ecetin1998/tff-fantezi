import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AUTH_HASH="ab1f975176f9a8e4c357dbcf1b7e9ca7de13473e5c7b03fbb91c5fb0147dec49";
async function sha256Hex(s){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const GITHUB_OIDC_AUDIENCE="tff-fantezi-scout";
const GITHUB_OIDC_ISSUER="https://token.actions.githubusercontent.com";
const GITHUB_REPOSITORY_ID="1353738004";
const GITHUB_JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks";
const OPS_REF="refs/heads/main";

function decodeJwtJson(value){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  return JSON.parse(atob(padded));
}
function decodeJwtBytes(value){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
async function verifyGithubOidc(token){
  const parts=token.split(".");
  if(parts.length!==3)return false;
  const header=decodeJwtJson(parts[0]),payload=decodeJwtJson(parts[1]);
  const now=Math.floor(Date.now()/1000);
  const audOk=Array.isArray(payload.aud)?payload.aud.includes(GITHUB_OIDC_AUDIENCE):payload.aud===GITHUB_OIDC_AUDIENCE;
  if(header.alg!=="RS256"||!header.kid||payload.iss!==GITHUB_OIDC_ISSUER||!audOk||
     Number(payload.exp||0)<now-30||Number(payload.nbf||0)>now+30||
     payload.repository_id!==GITHUB_REPOSITORY_ID||payload.repository!=="ecetin1998/tff-fantezi"||
     payload.ref!==OPS_REF||!["workflow_dispatch","schedule","push"].includes(String(payload.event_name||"")))return false;
  const jwks=await fetch(GITHUB_JWKS_URL).then(r=>r.json());
  const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid);
  if(!jwk)return false;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,decodeJwtBytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
}
async function authorized(req){
  const tok=req.headers.get("x-run-token")||"";
  if(tok && (await sha256Hex(tok))===AUTH_HASH)return true;
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return false;
  try{return await verifyGithubOidc(auth.slice(7))}catch{return false}
}
function num(x,d=0){const n=Number(x);return Number.isFinite(n)?n:d}
function cardPoints(yellow,red,scoring){return red?num(scoring.red,-3):yellow?num(scoring.yellow,-1):0}
function goalkeeperSaveRate(per90Saves){return Math.max(.55,Math.min(.82,.68+.025*(num(per90Saves)-3)))}
function expectedKeeperSaves(opponentGoalLambda,per90Saves,exposure=1){
  const saveRate=goalkeeperSaveRate(per90Saves);
  const goalLambda=Math.max(.05,num(opponentGoalLambda));
  const opponentSot=goalLambda/Math.max(.12,1-saveRate);
  return Math.max(0,opponentSot*saveRate*Math.max(0,exposure));
}
function redCardExitMinute(enter,leave,u){
  const start=Math.max(0,num(enter)),end=Math.max(start+1,num(leave,90));
  const draw=Math.max(0,Math.min(.999999999,num(u)));
  return Math.max(start+1,Math.min(end-1,Math.floor(start+draw*(end-start))));
}
function isActiveAt(enter,leave,minute){return num(enter)<=num(minute)&&num(leave)>num(minute)}
function bonusByCompetitionRank(ids,base,minutes,scoring){
  const bonusValues=(scoring.bonus||[3,2,1]).map(Number);
  const ordered=ids.filter(i=>minutes[i]>0).sort((a,b)=>base[b]-base[a]||a-b);
  const bonus={}; let previousScore=null,rank=-1;
  for(let index=0;index<ordered.length;index++){
    const i=ordered[index],score=base[i];
    if(previousScore===null||score!==previousScore)rank=index;
    previousScore=score;
    if(rank>=bonusValues.length)break;
    bonus[i]=bonusValues[rank];
  }
  return bonus;
}
function normalizedRole(p){
  const raw=String(p.sub_role||"").trim().toUpperCase().replace(/[ _-]+/g,"");
  if(["CB","CENTREBACK","CENTERBACK","STOPER"].includes(raw))return "CB";
  if(["WB","WINGBACK","LWB","RWB","KANATBEK"].includes(raw))return "WB";
  if(["FB","FULLBACK","LB","RB","BEK"].includes(raw))return "FB";
  return p.pos==="DEF"?"DEF":p.pos;
}
function allocationFor(p,a){
  const role=normalizedRole(p);
  const key=role==="CB"?"excess_cb":role==="FB"?"excess_fb":role==="WB"?"excess_wb":
    p.pos==="DEF"?"excess_def":p.pos==="MID"?"excess_mid":"excess_fwd";
  const excess=a?num(a[key]):0;
  const exposure=a?num(a.exposure):0;
  const observed=a?num(a.observed_matches):0;
  const attenuation=observed>=5?.55:.85;
  const rates=p.rates||[];
  const xgRate=num(rates[0]),goalRate=num(rates[1]),assistRate=num(rates[2]),xaRate=num(rates[3]);
  const adjustedXg=Math.max(xgRate*.45,xgRate-attenuation*excess/(2+exposure));
  return {
    goal:Math.max(1e-6,.75*adjustedXg+.25*goalRate),
    assist:Math.max(1e-6,.70*xaRate+.30*assistRate)
  };
}
function makeHist(){return Array(256).fill(0)}
function addHist(hist,score){
  const s=Math.max(-40,Math.min(215,Math.trunc(score)));
  hist[s+40]++;
}

Deno.serve(async(req)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401});
    const u=new URL(req.url);
    const GAMEWEEK=Math.trunc(num(u.searchParams.get("gw"),0));
    const BENCHMARK=String(u.searchParams.get("benchmark")||"").trim();
    const RUN_ID=String(u.searchParams.get("run")||"").trim();
    if(GAMEWEEK<1||GAMEWEEK>38)return Response.json({error:"gw must be 1..38"},{status:400});
    if(!BENCHMARK||!RUN_ID)return Response.json({error:"run and benchmark are required"},{status:400});
    const draws=Math.max(1,Math.min(10000,Math.trunc(num(u.searchParams.get("draws"),10000))));
    const seed=Math.trunc(num(u.searchParams.get("seed"),2026092801+GAMEWEEK*1000))>>>0;
    const sb=createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if((u.searchParams.get("mode")||"")==="reset"){
      const del=await sb.from("scout_replay_sim_accum").delete()
        .eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK);
      if(del.error)throw del.error;
      return Response.json({ok:true,mode:"reset",benchmark:BENCHMARK});
    }

    if((u.searchParams.get("mode")||"")==="finalize"){
      const [acc,inputCount]=await Promise.all([
        sb.from("scout_replay_sim_accum").select("player_id,draws")
          .eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK),
        sb.from("scout_replay_player_inputs").select("player_id",{count:"exact",head:true})
          .eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK)
      ]);
      if(acc.error)throw acc.error;
      if(inputCount.error)throw inputCount.error;
      const rows=acc.data||[];
      const minDraws=rows.length?Math.min(...rows.map(x=>Number(x.draws)||0)):0;
      const maxDraws=rows.length?Math.max(...rows.map(x=>Number(x.draws)||0)):0;
      const expectedPlayers=Number(inputCount.count||0);
      if(!expectedPlayers||rows.length!==expectedPlayers||minDraws<50000||maxDraws<50000){
        return Response.json({error:"accumulator incomplete",rows:rows.length,expected_players:expectedPlayers,min_draws:minDraws,max_draws:maxDraws},{status:409});
      }
      const finalized=await sb.rpc("scout_finalize_simulation_run",{
        p_run_id:RUN_ID,p_gameweek:GAMEWEEK,p_benchmark:BENCHMARK
      });
      if(finalized.error)throw finalized.error;
      const goalConfig=await sb.from("scout_goal_distribution_config")
        .select("version,distribution,alpha_used,gate_passed")
        .eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(goalConfig.error)throw goalConfig.error;
      let matchDistribution="Poisson";
      if(goalConfig.data?.gate_passed&&String(goalConfig.data?.distribution||"").toUpperCase()==="NB2"&&num(goalConfig.data?.alpha_used)>0){
        const prediction=await sb.rpc("populate_match_predictions_nb",{
          p_run_id:RUN_ID,p_gameweek:GAMEWEEK,p_benchmark:BENCHMARK,p_alpha:num(goalConfig.data.alpha_used)
        });
        if(prediction.error)throw prediction.error;
        matchDistribution="NB2";
      }
      return Response.json({ok:true,mode:"finalize",run_id:RUN_ID,gameweek:GAMEWEEK,benchmark:BENCHMARK,draws:minDraws,result:finalized.data,match_distribution:matchDistribution});
    }

    const [pq,mq,metaq,aq,rulesq,goalDistQ]=await Promise.all([
      sb.from("scout_replay_player_inputs").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).order("player_id"),
      sb.from("scout_replay_match_inputs").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).order("match_id"),
      sb.from("scout_replay_input_meta").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).single(),
      sb.from("scout_player_single_shot_adjustments").select("*").eq("through_gameweek",GAMEWEEK-1),
      sb.from("scout_game_rules").select("rules").order("season",{ascending:false}).limit(1).single(),
      sb.from("scout_goal_distribution_config").select("version,distribution,alpha_used,gate_passed").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle()
    ]);
    for(const q of [pq,mq,metaq,aq,rulesq,goalDistQ])if(q.error)throw q.error;
    const SCORING=rulesq.data?.rules?.scoring;
    if(!SCORING)throw new Error("canonical scoring rules missing");
    if(!(pq.data||[]).length)throw new Error("no player inputs for gameweek "+GAMEWEEK);
    if(!(mq.data||[]).length)throw new Error("no match inputs for gameweek "+GAMEWEEK);

    const P=(pq.data||[]).map(x=>({
      id:Number(x.player_id),club:Number(x.club_id),pos:String(x.position),
      avail:num(x.availability,1),role:num(x.role_probability),benchw:num(x.bench_weight),
      durations:(x.durations||[]).map(Number),duration_weights:(x.duration_weights||[]).map(Number),
      rates:(x.rates||[]).map(Number),sub_role:x.sub_role||null
    }));
    const M=P.length;
    const matches=(mq.data||[]).map(x=>({
      match_id:Number(x.match_id),home_id:Number(x.home_team_id),away_id:Number(x.away_team_id),
      home_lambda:num(x.home_lambda),away_lambda:num(x.away_lambda)
    }));
    const meta=metaq.data||{};
    const temperature=num(meta.temperature,1.7);
    const assistFraction=num(meta.assist_fraction,.67);
    const ownFraction=num(meta.own_goal_fraction,.031);
    const goalDist=goalDistQ.data||null;
    const useNb=Boolean(goalDist?.gate_passed)&&String(goalDist?.distribution||"").toUpperCase()==="NB2"&&num(goalDist?.alpha_used)>0;
    const goalAlpha=useNb?num(goalDist.alpha_used):0;
    const quotas=meta.team_formations||{};
    const adj=new Map((aq.data||[]).map(x=>[Number(x.player_id),x]));
    const allocation=P.map(p=>allocationFor(p,adj.get(p.id)));

    let state=seed>>>0;
    const random=()=>{
      state=(state+0x6D2B79F5)>>>0;
      let t=state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
    const normal=()=>{
      let u=0,v=0;
      while(u<=1e-12)u=random();
      while(v<=1e-12)v=random();
      return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    };
    const gamma=shape=>{
      if(!(shape>0))return 0;
      if(shape<1)return gamma(shape+1)*Math.pow(random(),1/shape);
      const d=shape-1/3,c=1/Math.sqrt(9*d);
      while(true){
        let x=normal(),v=1+c*x;
        if(v<=0)continue;
        v=v*v*v;
        const u=random();
        if(u<1-.0331*x*x*x*x)return d*v;
        if(Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;
      }
    };
    const poisson=l=>{
      l=Math.max(0,num(l));
      if(l===0)return 0;
      let n=0,t=1,L=Math.exp(-l);
      do{n++;t*=random()}while(t>L);
      return n-1;
    };
    const teamGoals=mu=>{
      if(!useNb)return poisson(mu);
      const shape=1/goalAlpha;
      return poisson(gamma(shape)*(goalAlpha*Math.max(0,num(mu))));
    };
    const pick=(ids,weight)=>{
      if(!ids.length)return null;
      let sum=0;for(const i of ids)sum+=Math.max(0,weight(i));
      if(sum<=0)return ids[Math.floor(random()*ids.length)];
      let z=random()*sum;
      for(const i of ids){z-=Math.max(0,weight(i));if(z<=0)return i}
      return ids[ids.length-1];
    };
    const drawDuration=p=>{
      let z=random();
      for(let j=0;j<p.durations.length;j++){z-=p.duration_weights[j];if(z<=0)return p.durations[j]}
      return p.durations[p.durations.length-1]??90;
    };

    const clubIds=[...new Set(matches.flatMap(m=>[m.home_id,m.away_id]))];
    const teams=Object.fromEntries(clubIds.map(club=>[club,P.map((p,i)=>p.club===club?i:-1).filter(i=>i>=0)]));
    const result=P.map(p=>({
      player_id:p.id,sum_xi:0,sum_play:0,sum_p60:0,sum_minutes:0,sum_core:0,sum_bonus:0,sum_fp:0,sum_p6:0,
      sum_xgoal:0,sum_xassist:0,hist:makeHist()
    }));
    const positions=["GK","DEF","MID","FWD"];

    function drawTeamLineup(club,mins,enter,leave,start){
      const ids=teams[club]||[];
      const available=new Set(ids.filter(i=>random()<P[i].avail));
      const used=new Set();
      for(const pos of positions){
        const k=num(quotas[String(club)]?.[pos],0);
        if(!k)continue;
        const loc=ids.filter(i=>P[i].pos===pos);
        if(loc.filter(i=>available.has(i)).length<k){
          for(const i of loc)if(P[i].avail>0)available.add(i);
        }
        const candidates=loc.filter(i=>available.has(i)).map(i=>({
          i,key:Math.log(P[i].role/(1-P[i].role))/temperature-Math.log(-Math.log(Math.max(1e-12,random())))
        })).sort((a,b)=>b.key-a.key);
        if(candidates.length<k)throw new Error("insufficient eligible "+club+" "+pos);
        for(const {i} of candidates.slice(0,k)){
          used.add(i);start[i]=1;enter[i]=0;leave[i]=P[i].pos==="GK"?90:drawDuration(P[i]);
        }
      }
      let substitutions=0;
      for(const i of ids.filter(i=>start[i]).sort((a,b)=>leave[a]-leave[b])){
        if(leave[i]>=90)continue;
        const candidates=ids.filter(j=>available.has(j)&&!used.has(j)&&P[j].pos===P[i].pos&&P[j].pos!=="GK");
        if(substitutions>=5||!candidates.length){leave[i]=90;continue}
        const j=pick(candidates,j=>P[j].benchw);
        enter[j]=leave[i];leave[j]=90;used.add(j);substitutions++;
      }
      for(const i of ids)mins[i]=Math.max(0,leave[i]-enter[i]);
      const total=ids.reduce((s,i)=>s+mins[i],0), starters=ids.reduce((s,i)=>s+start[i],0);
      if(total!==990||starters!==11)throw new Error("990/11 failed club "+club+" total "+total+" starters "+starters);
    }

    const keys=["appearance","goals","assists","cs","saves","conceded","cards","penalties","own"];
    for(let draw=0;draw<draws;draw++){
      const weeklyCore=new Float64Array(M),weeklyBonus=new Float64Array(M),weeklyFP=new Float64Array(M),weeklyMinutes=new Float64Array(M);
      const startedAny=new Uint8Array(M),playedAny=new Uint8Array(M),p60Any=new Uint8Array(M);
      const weeklyXGoal=new Float64Array(M),weeklyXAssist=new Float64Array(M);

      for(const match of matches){
        const clubs=[match.home_id,match.away_id];
        const both=(teams[clubs[0]]||[]).concat(teams[clubs[1]]||[]);
        const mins=new Int16Array(M),enter=new Int16Array(M).fill(91),leave=new Int16Array(M),start=new Uint8Array(M);
        drawTeamLineup(clubs[0],mins,enter,leave,start);
        drawTeamLineup(clubs[1],mins,enter,leave,start);

        const comp=Object.fromEntries(keys.map(k=>[k,new Int16Array(M)]));
        for(const i of both){
          const scheduledExposure=mins[i]/90;
          if(mins[i]<=0)continue;
          const yc=random()<Math.min(.8,Math.max(0,P[i].rates[4]*scheduledExposure));
          const rc=random()<Math.min(.15,Math.max(0,P[i].rates[5]*scheduledExposure));
          comp.cards[i]=cardPoints(yc,rc,SCORING);
          if(rc){
            leave[i]=redCardExitMinute(enter[i],leave[i],random());
            mins[i]=Math.max(0,leave[i]-enter[i]);
          }
          comp.appearance[i]=(mins[i]>0?SCORING.appearance:0)+(mins[i]>60?SCORING.appearance_60:0);
        }

        const score=[teamGoals(match.home_lambda),teamGoals(match.away_lambda)];
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
            const own=random()<ownFraction;
            let scorer=null;
            if(own&&op.length){
              const ownScorer=pick(op,()=>1);
              if(ownScorer!==null)comp.own[ownScorer]+=SCORING.own_goal;
            }else if(scorerCandidate!==null){
              scorer=scorerCandidate;
              comp.goals[scorer]+=SCORING.goal[P[scorer].pos];
              weeklyXGoal[scorer]+=1;
            }
            const assistPool=scorer===null?on:on.filter(i=>i!==scorer);
            if(assistPool.length&&random()<assistFraction){
              const a=pick(assistPool,i=>allocation[i].assist);
              if(a!==null){
                comp.assists[a]+=SCORING.assist;
                weeklyXAssist[a]+=1;
              }
            }
          }
        }

        const base={};
        for(const i of both){
          const p=P[i],rates=p.rates,exposure=mins[i]/90;
          const opponentLambda=p.club===clubs[0]?match.away_lambda:match.home_lambda;
          comp.cs[i]=mins[i]>=60&&score[p.club===clubs[0]?1:0]===0?SCORING.clean_sheet[p.pos]:0;
          if(SCORING.conceded_per_2[p.pos])comp.conceded[i]=Math.floor(gc[i]/2)*SCORING.conceded_per_2[p.pos];
          if(p.pos==="GK"){
            const saveLambda=expectedKeeperSaves(opponentLambda,rates[6],exposure);
            comp.saves[i]=Math.floor(poisson(saveLambda)/3)*SCORING.saves_per_3;
          }
          const penaltyPressure=Math.max(.25,Math.min(3,opponentLambda/1.35));
          comp.penalties[i]=SCORING.penalty_miss*poisson(rates[7]*exposure)
            +(p.pos==="GK"?SCORING.penalty_save*poisson(rates[8]*exposure*penaltyPressure):0);
          base[i]=keys.reduce((sum,k)=>sum+comp[k][i],0);
        }
        const bon=bonusByCompetitionRank(both,base,mins,SCORING);
        for(const i of both){
          const b=bon[i]||0,fp=base[i]+b;
          startedAny[i]=Math.max(startedAny[i],start[i]);
          playedAny[i]=Math.max(playedAny[i],mins[i]>0?1:0);
          p60Any[i]=Math.max(p60Any[i],mins[i]>=60?1:0);
          weeklyMinutes[i]+=mins[i];weeklyCore[i]+=base[i];weeklyBonus[i]+=b;weeklyFP[i]+=fp;
        }
      }

      for(let i=0;i<M;i++){
        const r=result[i],fp=weeklyFP[i];
        r.sum_xi+=startedAny[i];
        r.sum_play+=playedAny[i];
        r.sum_p60+=p60Any[i];
        r.sum_minutes+=weeklyMinutes[i];
        r.sum_core+=weeklyCore[i];
        r.sum_bonus+=weeklyBonus[i];
        r.sum_fp+=fp;
        r.sum_p6+=fp>=6?1:0;
        r.sum_xgoal+=weeklyXGoal[i];
        r.sum_xassist+=weeklyXAssist[i];
        addHist(r.hist,fp);
      }
    }

    const {error:mergeError}=await sb.rpc("merge_replay_sim_chunk",{
      p_gameweek:GAMEWEEK,p_benchmark:BENCHMARK,p_draws:draws,p_rows:result
    });
    if(mergeError)throw mergeError;
    return Response.json({ok:true,run_id:RUN_ID,gameweek:GAMEWEEK,benchmark:BENCHMARK,draws,seed,players:M,matches:matches.length,goal_distribution:useNb?"NB2":"Poisson",goal_alpha:goalAlpha});
  }catch(e){
    return Response.json({error:String(e?.message||e),stack:String(e?.stack||"").slice(0,1200)},{status:500});
  }
});