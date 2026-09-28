import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GITHUB_OIDC_AUDIENCE="tff-fantezi-scout";
const GITHUB_OIDC_ISSUER="https://token.actions.githubusercontent.com";
const GITHUB_REPOSITORY_ID="1353738004";
const GITHUB_JWKS_URL="https://token.actions.githubusercontent.com/.well-known/jwks";
const OPS_REF="refs/heads/main";

function decodeJwtJson(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  return JSON.parse(atob(padded));
}
function decodeJwtBytes(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
async function verifyGithubOidc(token:string){
  const parts=token.split(".");
  if(parts.length!==3)return false;
  const header=decodeJwtJson(parts[0]),payload=decodeJwtJson(parts[1]);
  const now=Math.floor(Date.now()/1000);
  const audOk=Array.isArray(payload.aud)?payload.aud.includes(GITHUB_OIDC_AUDIENCE):payload.aud===GITHUB_OIDC_AUDIENCE;
  if(header.alg!=="RS256"||!header.kid||payload.iss!==GITHUB_OIDC_ISSUER||!audOk||
     Number(payload.exp||0)<now-30||Number(payload.nbf||0)>now+30||
     payload.repository_id!==GITHUB_REPOSITORY_ID||payload.repository!=="ecetin1998/tff-fantezi"||
     payload.ref!==OPS_REF||payload.event_name!=="workflow_dispatch")return false;
  const jwks=await fetch(GITHUB_JWKS_URL).then(r=>r.json());
  const jwk=(jwks.keys||[]).find((k:any)=>k.kid===header.kid);
  if(!jwk)return false;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,decodeJwtBytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
}
async function authorized(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return false;
  try{return await verifyGithubOidc(auth.slice(7))}catch{return false}
}
function num(x:any,d=0){const n=Number(x);return Number.isFinite(n)?n:d}
function redCardExitMinute(enter:number,leave:number,u:number){
  const start=Math.max(0,num(enter)),end=Math.max(start+1,num(leave,90));
  const draw=Math.max(0,Math.min(.999999999,num(u)));
  return Math.max(start+1,Math.min(end-1,Math.floor(start+draw*(end-start))));
}
function isActiveAt(enter:number,leave:number,minute:number){return num(enter)<=num(minute)&&num(leave)>num(minute)}
function normalizedRole(p:any){
  const raw=String(p.sub_role||"").trim().toUpperCase().replace(/[ _-]+/g,"");
  if(["CB","CENTREBACK","CENTERBACK","STOPER"].includes(raw))return "CB";
  if(["WB","WINGBACK","LWB","RWB","KANATBEK"].includes(raw))return "WB";
  if(["FB","FULLBACK","LB","RB","BEK"].includes(raw))return "FB";
  return p.pos==="DEF"?"DEF":p.pos;
}
function allocationFor(p:any,a:any){
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
function addHist(hist:number[],score:number){
  const s=Math.max(-40,Math.min(215,Math.trunc(score)));
  hist[s+40]++;
}
function goalkeeperSaveRate(per90Saves:number){return Math.max(.55,Math.min(.82,.68+.025*(num(per90Saves)-3)))}
function expectedKeeperSaves(opponentGoalLambda:number,per90Saves:number,exposure=1){
  const saveRate=goalkeeperSaveRate(per90Saves);
  const goalLambda=Math.max(.05,num(opponentGoalLambda));
  const opponentSot=goalLambda/Math.max(.12,1-saveRate);
  return Math.max(0,opponentSot*saveRate*Math.max(0,exposure));
}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401});
    const u=new URL(req.url);
    const GAMEWEEK=Math.trunc(num(u.searchParams.get("gw")));
    const RUN_ID=String(u.searchParams.get("run")||"");
    const BENCHMARK=String(u.searchParams.get("benchmark")||"");
    if(GAMEWEEK<1||GAMEWEEK>38||!RUN_ID||!BENCHMARK)return Response.json({error:"gw, run and benchmark are required"},{status:400});
    const draws=Math.max(1,Math.min(10000,Math.trunc(num(u.searchParams.get("draws"),10000))));
    const seed=Math.trunc(num(u.searchParams.get("seed"),2026000000+GAMEWEEK*1000))>>>0;
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [runq,rulesq]=await Promise.all([
      sb.from("scout_model_runs").select("id,gameweek,is_current").eq("id",RUN_ID).single(),
      sb.from("scout_game_rules").select("rules").order("season",{ascending:false}).limit(1).single()
    ]);
    if(runq.error)throw runq.error;
    if(rulesq.error)throw rulesq.error;
    if(Number(runq.data.gameweek)!==GAMEWEEK)return Response.json({error:"run/gameweek mismatch"},{status:409});
    if(runq.data.is_current)return Response.json({error:"refusing to mutate current run"},{status:409});
    const SCORING=rulesq.data?.rules?.scoring;
    if(!SCORING)return Response.json({error:"scoring rules missing"},{status:500});

    const mode=u.searchParams.get("mode")||"";
    if(mode==="reset"){
      const del=await sb.from("scout_replay_sim_accum").delete().eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK);
      if(del.error)throw del.error;
      return Response.json({ok:true,mode:"reset",gameweek:GAMEWEEK,benchmark:BENCHMARK});
    }
    if(mode==="finalize"){
      const [acc,inp]=await Promise.all([
        sb.from("scout_replay_sim_accum").select("player_id,draws").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK),
        sb.from("scout_replay_player_inputs").select("player_id").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK)
      ]);
      if(acc.error)throw acc.error;if(inp.error)throw inp.error;
      const rows=acc.data||[],expected=(inp.data||[]).length;
      const minDraws=rows.length?Math.min(...rows.map((x:any)=>Number(x.draws)||0)):0;
      if(!expected||rows.length!==expected||minDraws<50000){
        return Response.json({error:"accumulator incomplete",rows:rows.length,expected,min_draws:minDraws},{status:409});
      }
      const applied=await sb.rpc("scout_apply_live_accum",{p_run_id:RUN_ID,p_gameweek:GAMEWEEK,p_benchmark:BENCHMARK});
      if(applied.error)throw applied.error;
      return Response.json({ok:true,mode:"finalize",run_id:RUN_ID,gameweek:GAMEWEEK,benchmark:BENCHMARK,updated_players:applied.data,draws:minDraws});
    }

    const [pq,mq,metaq,aq]=await Promise.all([
      sb.from("scout_replay_player_inputs").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).order("player_id"),
      sb.from("scout_replay_match_inputs").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).order("match_id"),
      sb.from("scout_replay_input_meta").select("*").eq("gameweek",GAMEWEEK).eq("benchmark_version",BENCHMARK).single(),
      sb.from("scout_player_single_shot_adjustments").select("*").eq("through_gameweek",Math.max(0,GAMEWEEK-1))
    ]);
    for(const q of [pq,mq,metaq,aq])if(q.error)throw q.error;
    if(!(pq.data||[]).length)throw new Error("no simulation players");
    if((mq.data||[]).length!==9)throw new Error("expected 9 matches, got "+(mq.data||[]).length);

    const P=(pq.data||[]).map((x:any)=>({
      id:Number(x.player_id),club:Number(x.club_id),pos:String(x.position),
      avail:num(x.availability,1),role:num(x.role_probability),benchw:num(x.bench_weight),
      durations:(x.durations||[]).map(Number),duration_weights:(x.duration_weights||[]).map(Number),
      rates:(x.rates||[]).map(Number),sub_role:x.sub_role||null
    }));
    const M=P.length;
    const matches=(mq.data||[]).map((x:any)=>({
      match_id:Number(x.match_id),home_id:Number(x.home_team_id),away_id:Number(x.away_team_id),
      home_lambda:num(x.home_lambda),away_lambda:num(x.away_lambda)
    }));
    const meta=metaq.data||{};
    const temperature=num(meta.temperature,1.7);
    const assistFraction=num(meta.assist_fraction,.67);
    const ownFraction=num(meta.own_goal_fraction,.031);
    const quotas=meta.team_formations||meta.formations||{};
    const adj=new Map((aq.data||[]).map((x:any)=>[Number(x.player_id),x]));
    const allocation=P.map((p:any)=>allocationFor(p,adj.get(p.id)));
    const cardPoints=(yellow:boolean,red:boolean)=>red?num(SCORING.red,-3):yellow?num(SCORING.yellow,-1):0;
    const bonusValues=(SCORING.bonus||[3,2,1]).map(Number);

    let state=seed>>>0;
    const random=()=>{
      state=(state+0x6D2B79F5)>>>0;
      let t=state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
    const poisson=(lambda:number)=>{
      const l=Math.max(0,num(lambda));
      if(l===0)return 0;
      let n=0,t=1,L=Math.exp(-l);
      do{n++;t*=random()}while(t>L);
      return n-1;
    };
    const pick=(ids:number[],weight:(i:number)=>number)=>{
      if(!ids.length)return null;
      let sum=0;for(const i of ids)sum+=Math.max(0,weight(i));
      if(sum<=0)return ids[Math.floor(random()*ids.length)];
      let z=random()*sum;
      for(const i of ids){z-=Math.max(0,weight(i));if(z<=0)return i}
      return ids[ids.length-1];
    };
    const drawDuration=(p:any)=>{
      let z=random();
      for(let j=0;j<p.durations.length;j++){z-=num(p.duration_weights[j]);if(z<=0)return num(p.durations[j],90)}
      return num(p.durations[p.durations.length-1],90);
    };
    const bonusByCompetitionRank=(ids:number[],base:any,minutes:Int16Array)=>{
      const ordered=ids.filter(i=>minutes[i]>0).sort((a,b)=>base[b]-base[a]||a-b);
      const bonus:any={};let previousScore:any=null,rank=-1;
      for(let index=0;index<ordered.length;index++){
        const i=ordered[index],score=base[i];
        if(previousScore===null||score!==previousScore)rank=index;
        previousScore=score;
        if(rank>=bonusValues.length)break;
        bonus[i]=bonusValues[rank];
      }
      return bonus;
    };

    const clubIds=[...new Set(matches.flatMap((m:any)=>[m.home_id,m.away_id]))];
    const teams:any=Object.fromEntries(clubIds.map(club=>[club,P.map((p:any,i:number)=>p.club===club?i:-1).filter((i:number)=>i>=0)]));
    const result=P.map((p:any)=>({
      player_id:p.id,sum_xi:0,sum_play:0,sum_p60:0,sum_minutes:0,sum_core:0,sum_bonus:0,sum_fp:0,sum_p6:0,
      sum_xgoal:0,sum_xassist:0,hist:makeHist()
    }));
    const positions=["GK","DEF","MID","FWD"];

    function drawTeamLineup(club:number,mins:Int16Array,enter:Int16Array,leave:Int16Array,start:Uint8Array){
      const ids=teams[club]||[];
      const available=new Set(ids.filter((i:number)=>random()<P[i].avail));
      const used=new Set<number>();
      for(const pos of positions){
        const k=num(quotas[String(club)]?.[pos],0);
        if(!k)continue;
        const loc=ids.filter((i:number)=>P[i].pos===pos);
        if(loc.filter((i:number)=>available.has(i)).length<k){
          for(const i of loc)if(P[i].avail>0)available.add(i);
        }
        const candidates=loc.filter((i:number)=>available.has(i)).map((i:number)=>({
          i,key:Math.log(Math.max(.001,P[i].role)/Math.max(.001,1-P[i].role))/temperature-Math.log(-Math.log(Math.max(1e-12,random())))
        })).sort((a:any,b:any)=>b.key-a.key);
        if(candidates.length<k)throw new Error("insufficient eligible "+club+" "+pos);
        for(const {i} of candidates.slice(0,k)){
          used.add(i);start[i]=1;enter[i]=0;leave[i]=P[i].pos==="GK"?90:Math.max(1,Math.min(90,Math.round(drawDuration(P[i]))));
        }
      }
      let substitutions=0;
      for(const i of ids.filter((i:number)=>start[i]).sort((a:number,b:number)=>leave[a]-leave[b])){
        if(leave[i]>=90)continue;
        const candidates=ids.filter((j:number)=>available.has(j)&&!used.has(j)&&P[j].pos===P[i].pos&&P[j].pos!=="GK");
        if(substitutions>=5||!candidates.length){leave[i]=90;continue}
        const j=pick(candidates,(j:number)=>P[j].benchw);
        if(j===null){leave[i]=90;continue}
        enter[j]=leave[i];leave[j]=90;used.add(j);substitutions++;
      }
      for(const i of ids)mins[i]=Math.max(0,leave[i]-enter[i]);
      const total=ids.reduce((s:number,i:number)=>s+mins[i],0),starters=ids.reduce((s:number,i:number)=>s+start[i],0);
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

        const comp:any=Object.fromEntries(keys.map(k=>[k,new Int16Array(M)]));
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
          comp.appearance[i]=(mins[i]>0?num(SCORING.appearance,1):0)+(mins[i]>60?num(SCORING.appearance_60,1):0);
        }

        const score=[poisson(match.home_lambda),poisson(match.away_lambda)];
        const gc=new Int16Array(M);
        for(let side=0;side<2;side++){
          const ids=teams[clubs[side]]||[],opp=teams[clubs[1-side]]||[];
          for(let e=0;e<score[side];e++){
            const t=random()*90;
            const on=ids.filter((i:number)=>isActiveAt(enter[i],leave[i],t));
            const op=opp.filter((i:number)=>isActiveAt(enter[i],leave[i],t));
            for(const i of op)gc[i]++;
            if(!on.length)continue;
            const scorerCandidate=pick(on,(i:number)=>allocation[i].goal);
            const own=random()<ownFraction;
            let scorer:number|null=null;
            if(own&&op.length){
              const ownScorer=pick(op,()=>1);
              if(ownScorer!==null)comp.own[ownScorer]+=num(SCORING.own_goal,-2);
            }else if(scorerCandidate!==null){
              scorer=scorerCandidate;
              comp.goals[scorer]+=num(SCORING.goal?.[P[scorer].pos]);
              weeklyXGoal[scorer]+=1;
            }
            const assistPool=scorer===null?on:on.filter((i:number)=>i!==scorer);
            if(assistPool.length&&random()<assistFraction){
              const a=pick(assistPool,(i:number)=>allocation[i].assist);
              if(a!==null){comp.assists[a]+=num(SCORING.assist,3);weeklyXAssist[a]+=1}
            }
          }
        }

        const base:any={};
        for(const i of both){
          const p=P[i],rates=p.rates,exposure=mins[i]/90;
          const opponentLambda=p.club===clubs[0]?match.away_lambda:match.home_lambda;
          comp.cs[i]=mins[i]>=60&&score[p.club===clubs[0]?1:0]===0?num(SCORING.clean_sheet?.[p.pos]):0;
          if(SCORING.conceded_per_2?.[p.pos])comp.conceded[i]=Math.floor(gc[i]/2)*num(SCORING.conceded_per_2[p.pos]);
          if(p.pos==="GK"){
            const saveLambda=expectedKeeperSaves(opponentLambda,rates[6],exposure);
            comp.saves[i]=Math.floor(poisson(saveLambda)/3)*num(SCORING.saves_per_3,1);
          }
          const penaltyPressure=Math.max(.25,Math.min(3,opponentLambda/1.35));
          comp.penalties[i]=num(SCORING.penalty_miss,-2)*poisson(rates[7]*exposure)
            +(p.pos==="GK"?num(SCORING.penalty_save,5)*poisson(rates[8]*exposure*penaltyPressure):0);
          base[i]=keys.reduce((sum,k)=>sum+comp[k][i],0);
        }
        const bon=bonusByCompetitionRank(both,base,mins);
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
        r.sum_xi+=startedAny[i];r.sum_play+=playedAny[i];r.sum_p60+=p60Any[i];r.sum_minutes+=weeklyMinutes[i];
        r.sum_core+=weeklyCore[i];r.sum_bonus+=weeklyBonus[i];r.sum_fp+=fp;r.sum_p6+=fp>=6?1:0;
        r.sum_xgoal+=weeklyXGoal[i];r.sum_xassist+=weeklyXAssist[i];addHist(r.hist,fp);
      }
    }

    const merged=await sb.rpc("merge_replay_sim_chunk",{p_gameweek:GAMEWEEK,p_benchmark:BENCHMARK,p_draws:draws,p_rows:result});
    if(merged.error)throw merged.error;
    return Response.json({ok:true,run_id:RUN_ID,gameweek:GAMEWEEK,benchmark:BENCHMARK,draws,seed,players:M,matches:matches.length});
  }catch(e:any){
    return Response.json({error:String(e?.message||e),stack:String(e?.stack||"").slice(0,1600)},{status:500});
  }
});
