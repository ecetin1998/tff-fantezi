import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GITHUB_OIDC_AUDIENCE = "tff-fantezi-scout";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_REPOSITORY_ID = "1353738004";
const GITHUB_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

function decodeJwtPart(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}
function decodeJwtBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function verifyGithubOidc(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) return false;
  const now = Math.floor(Date.now() / 1000);
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(GITHUB_OIDC_AUDIENCE)
    : payload.aud === GITHUB_OIDC_AUDIENCE;
  if (
    payload.iss !== GITHUB_OIDC_ISSUER ||
    !audOk ||
    Number(payload.exp || 0) < now - 30 ||
    Number(payload.nbf || 0) > now + 30 ||
    payload.repository_id !== GITHUB_REPOSITORY_ID ||
    payload.repository !== "ecetin1998/tff-fantezi" ||
    payload.ref !== "refs/heads/main" ||
    payload.event_name !== "workflow_dispatch"
  ) return false;
  const jwks = await fetch(GITHUB_JWKS_URL).then((r) => r.json());
  const jwk = (jwks.keys || []).find((k: any) => k.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  return crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    decodeJwtBytes(parts[2]),
    signed,
  );
}
async function gateAuthorized(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  try {
    return await verifyGithubOidc(authorization.slice(7));
  } catch {
    return false;
  }
}


const BENCHMARK = "fresh-current-logic+cold-start-v1-2026-09-24";
const GW = 1;

function norm(s: unknown) {
  return String(s ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (!(await gateAuthorized(req))) {
    return Response.json({error:"unauthorized"},{status:401});
  }
  const draws = Math.max(1, Math.min(10000, Number(url.searchParams.get("draws") || "10000")));
  const seed = (Number(url.searchParams.get("seed") || "3707070") >>> 0);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const [teamsQ,poolQ,teamPQ,playerPQ,posPQ,fixturesQ] = await Promise.all([
    supabase.from("scout_teams").select("id,name").order("id"),
    supabase.from("scout_player_weekly_points").select("player_id,player_name,team_name,position").eq("gameweek",GW).order("player_id"),
    supabase.from("scout_preseason_team_priors").select("*").eq("season","2026-27").eq("prior_version","cold-start-v1"),
    supabase.from("scout_preseason_player_priors").select("*").eq("season","2026-27").eq("prior_version","cold-start-v1"),
    supabase.from("scout_preseason_position_priors").select("*").eq("season","2026-27").eq("prior_version","cold-start-v1"),
    supabase.from("scout_match_history").select("match_id,home_team_id,home_team_name,away_team_id,away_team_name").eq("gameweek",GW).order("kickoff_at")
  ]);
  for (const q of [teamsQ,poolQ,teamPQ,playerPQ,posPQ,fixturesQ]) if (q.error) throw q.error;

  const teams:any[] = teamsQ.data || [];
  const pool:any[] = poolQ.data || [];
  const teamP:any[] = teamPQ.data || [];
  const playerP:any[] = playerPQ.data || [];
  const posP:any[] = posPQ.data || [];
  const fixtures:any[] = fixturesQ.data || [];

  if (pool.length !== 491 || teamP.length !== 18 || posP.length !== 4 || fixtures.length !== 9) {
    return new Response(JSON.stringify({error:"source coverage mismatch", counts:{pool:pool.length,teamP:teamP.length,posP:posP.length,fixtures:fixtures.length}}), {status:409, headers:{"content-type":"application/json"}});
  }

  const teamMap = new Map<string,number>();
  for (const t of teams) teamMap.set(norm(t.name), Number(t.id));
  for (const f of fixtures) {
    teamMap.set(norm(f.home_team_name), Number(f.home_team_id));
    teamMap.set(norm(f.away_team_name), Number(f.away_team_id));
  }
  for (const [k,v] of Object.entries({
    "amed sportif faaliyetler":5,
    "arca corum fk":8,
    "tumoson konyaspor":7,
    "tümosan konyaspor":7,
    "caykur rizespor":12,
    "corendon alanyaspor":14,
    "istanbul basaksehir":13,
    "gaziantep fk":18
  })) teamMap.set(norm(k), Number(v));

  const teamId = (name:string) => {
    const n = norm(name);
    if (teamMap.has(n)) return teamMap.get(n)!;
    for (const [k,v] of teamMap) if (n.includes(k) || k.includes(n)) return v;
    return 0;
  };

  const pPrior = new Map<number,any>(playerP.map(x => [Number(x.player_id),x]));
  const posPrior = new Map<string,any>(posP.map(x => [x.position,x]));
  const teamPrior = new Map<number,any>(teamP.map(x => [Number(x.team_id),x]));
  const quotas:any = {GK:1,DEF:4,MID:5,FWD:1};
  const posCode:any = {GK:0,DEF:1,MID:2,FWD:3};
  const quotaArr = [1,4,5,1], goalPts = [10,6,5,4], csPts = [4,4,1,0];

  const groupCount = Array.from({length:19},()=>[0,0,0,0]);
  for (const a of pool) {
    const t=teamId(a.team_name), pc=posCode[a.position];
    if (t && pc!==undefined) groupCount[t][pc]++;
  }
  for (let t=1;t<=18;t++) for (let pc=0;pc<4;pc++) {
    if (groupCount[t][pc] < quotaArr[pc]) {
      return new Response(JSON.stringify({error:"position pool too small",team:t,pos:pc,count:groupCount[t][pc]}),{status:409,headers:{"content-type":"application/json"}});
    }
  }

  const poolById = new Map<number,any>(pool.map(a => [Number(a.player_id),a]));
  const cardRates:any = {};
  for (const pos of Object.keys(quotas)) {
    let mins=0,ys=0,rs=0;
    for (const x of playerP) {
      const a=poolById.get(Number(x.player_id));
      if (a?.position!==pos) continue;
      mins+=Number(x.source_minutes)||0; ys+=Number(x.yellow_cards)||0; rs+=Number(x.red_cards)||0;
    }
    cardRates[pos]={yellow:mins?ys*90/mins:.08,red:mins?rs*90/mins:.01};
  }

  const P:any[] = [];
  for (const a of pool) {
    const club=teamId(a.team_name), pos=a.position, pc=posCode[pos], pp=pPrior.get(Number(a.player_id)), po=posPrior.get(pos);
    const neutral=Math.max(.03,Math.min(.85,quotas[pos]/groupCount[club][pc]));
    const conf=pp?Math.max(.2,Math.min(.95,Number(pp.prior_confidence)||.2)):0;
    const startRaw=pp?Math.max(0,Math.min(.98,(Number(pp.source_starts)||0)/34)):neutral;
    const role=Math.max(.002,Math.min(.98,conf*startRaw+(1-conf)*neutral));
    const posMin=Number(po.typical_start_minutes)||75;
    const rawMin=pp&&Number(pp.source_starts)>0?Math.min(90,(Number(pp.source_minutes)||0)/Number(pp.source_starts)):posMin;
    const sm=Math.max(45,Math.min(90,conf*rawMin+(1-conf)*posMin));
    const blend=(field:string,fallback:number)=>{const v=pp?Number(pp[field]):NaN;return Number.isFinite(v)?conf*v+(1-conf)*fallback:fallback};
    const yellow=pp&&Number(pp.source_minutes)>0?conf*((Number(pp.yellow_cards)||0)*90/Number(pp.source_minutes))+(1-conf)*cardRates[pos].yellow:cardRates[pos].yellow;
    const red=pp&&Number(pp.source_minutes)>0?conf*((Number(pp.red_cards)||0)*90/Number(pp.source_minutes))+(1-conf)*cardRates[pos].red:cardRates[pos].red;
    const subApps=pp?Math.max(0,(Number(pp.source_matches)||0)-(Number(pp.source_starts)||0)):0;
    P.push({
      id:Number(a.player_id), club, pos, pc,
      logit:Math.log(role/(1-role))/1.7,
      benchw:.04+(pp?conf*(subApps+.15*(Number(pp.source_starts)||0))+(1-conf)*.5:.5),
      d1:pos==="GK"?90:Math.max(30,Math.round(sm-10)),
      d2:pos==="GK"?90:Math.round(sm),
      d3:pos==="GK"?90:Math.min(90,Math.round(sm+5)),
      rates:[
        blend("xg_per90",Number(po.xg_per90)||0),
        blend("goals_per90",Number(po.goals_per90)||0),
        blend("assists_per90",Number(po.assists_per90)||0),
        blend("xa_per90",Number(po.xa_per90)||0),
        yellow,red,
        blend("saves_per90",Number(po.saves_per90)||0),
        pos==="FWD"?.008:pos==="MID"?.004:.001,
        pos==="GK"?.015:0,
        .002,
        blend("shots_per90",Number(po.shots_per90)||0),
        blend("sot_per90",Number(po.sot_per90)||0)
      ]
    });
  }

  const mu=Number(teamP[0].league_mean_goal_rate)||1.326797;
  const homeFactor=Math.sqrt(1.44/mu), awayFactor=Math.sqrt(1.21/mu);
  const rawMatches=fixtures.map(f=>{
    const hp=teamPrior.get(Number(f.home_team_id)), ap=teamPrior.get(Number(f.away_team_id));
    return {
      home_id:Number(f.home_team_id), away_id:Number(f.away_team_id),
      hl:Math.max(.15,Math.min(6,Number(hp.attack_rate)*Number(ap.defence_rate)/mu*homeFactor)),
      al:Math.max(.15,Math.min(6,Number(ap.attack_rate)*Number(hp.defence_rate)/mu*awayFactor))
    };
  });
  let totalGoals=0,totalAssists=0;
  for(const pp of playerP){totalGoals+=Number(pp.goals)||0;totalAssists+=Number(pp.assists)||0}
  const assistFraction=Math.max(.45,Math.min(.9,totalGoals?totalAssists/totalGoals:.7)), ownFraction=.02;

  const M=P.length,off=40,bins=181;
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return(state+.5)/4294967296};
  const poisson=(l:number)=>{let n=0,t=1,L=Math.exp(-l);do{n++;t*=random()}while(t>L);return n-1};

  const teamsIdx=Array.from({length:19},()=>[] as number[]);
  const groups=Array.from({length:19},()=>[[],[],[],[]] as number[][]);
  for(let i=0;i<M;i++){teamsIdx[P[i].club].push(i);groups[P[i].club][P[i].pc].push(i)}
  const matches=rawMatches.map(m=>({...m,home:teamsIdx[m.home_id],away:teamsIdx[m.away_id],both:teamsIdx[m.home_id].concat(teamsIdx[m.away_id])}));

  const sumXi=new Float64Array(M),sumPlay=new Float64Array(M),sumP60=new Float64Array(M),sumMin=new Float64Array(M),sumCore=new Float64Array(M),sumBonus=new Float64Array(M),sumFP=new Float64Array(M),sumP6=new Float64Array(M);
  const hist=Array.from({length:M},()=>new Uint32Array(bins));
  const mins=new Int16Array(M),enter=new Int16Array(M),leave=new Int16Array(M),start=new Uint8Array(M),used=new Uint8Array(M),gc=new Int16Array(M),base=new Int16Array(M);
  const app=new Int8Array(M),goals=new Int8Array(M),assists=new Int8Array(M),cs=new Int8Array(M),saves=new Int8Array(M),conceded=new Int8Array(M),cards=new Int8Array(M),pen=new Int8Array(M),ownc=new Int8Array(M);

  const pick=(arr:number[],wf:(i:number)=>number)=>{
    let s=0;for(let z=0;z<arr.length;z++)s+=wf(arr[z]);
    let u=random()*s;
    for(let z=0;z<arr.length;z++){const i=arr[z];u-=wf(i);if(u<=0)return i}
    return arr[arr.length-1];
  };
  const choose=(arr:number[],k:number)=>{
    const bi=new Int32Array(k),bk=new Float64Array(k);bk.fill(-1e99);
    for(let z=0;z<arr.length;z++){
      const i=arr[z],key=P[i].logit-Math.log(-Math.log(random()));
      let p=0;while(p<k&&key<=bk[p])p++;
      if(p<k){for(let q=k-1;q>p;q--){bk[q]=bk[q-1];bi[q]=bi[q-1]}bk[p]=key;bi[p]=i}
    }
    return bi;
  };

  const started=Date.now();
  for(let draw=0;draw<draws;draw++){
    mins.fill(0);enter.fill(91);leave.fill(0);start.fill(0);used.fill(0);app.fill(0);goals.fill(0);assists.fill(0);cs.fill(0);saves.fill(0);conceded.fill(0);cards.fill(0);pen.fill(0);ownc.fill(0);
    for(let c=1;c<=18;c++){
      for(let pc=0;pc<4;pc++){
        const k=quotaArr[pc],chosen=choose(groups[c][pc],k);
        for(let q=0;q<k;q++){
          const i=chosen[q];used[i]=1;start[i]=1;enter[i]=0;
          if(pc===0)leave[i]=90;else{const u=random();leave[i]=u<.2?P[i].d1:u<.7?P[i].d2:P[i].d3}
        }
      }
      const starters:number[]=[];for(const i of teamsIdx[c])if(start[i]&&leave[i]<90)starters.push(i);
      starters.sort((a,b)=>leave[a]-leave[b]);let subs=0;
      for(const i of starters){
        if(subs>=5){leave[i]=90;continue}
        const arr=groups[c][P[i].pc],cand:number[]=[];
        for(const j of arr)if(!used[j]&&P[j].pc!==0)cand.push(j);
        if(!cand.length){leave[i]=90;continue}
        const j=pick(cand,j=>P[j].benchw);enter[j]=leave[i];leave[j]=90;used[j]=1;subs++;
      }
      for(const i of teamsIdx[c]){mins[i]=Math.max(0,leave[i]-enter[i]);app[i]=(mins[i]>0?1:0)+(mins[i]>60?1:0)}
    }
    for(const m of matches){
      gc.fill(0);
      for(const i of m.both){base[i]=0;goals[i]=0;assists[i]=0;cs[i]=0;saves[i]=0;conceded[i]=0;cards[i]=0;pen[i]=0;ownc[i]=0}
      const scores=[poisson(m.hl),poisson(m.al)];
      for(let side=0;side<2;side++){
        const ids=side===0?m.home:m.away,opp=side===0?m.away:m.home;
        for(let e=0;e<scores[side];e++){
          const tm=random()*90,on:number[]=[],op:number[]=[];
          for(const i of ids)if(enter[i]<=tm&&leave[i]>tm)on.push(i);
          for(const i of opp)if(enter[i]<=tm&&leave[i]>tm){op.push(i);gc[i]++}
          const scorer=pick(on,i=>Math.max(1e-6,P[i].rates[0]+.15*P[i].rates[1]+.10*P[i].rates[11]+.025*P[i].rates[10]));
          if(random()<ownFraction)ownc[pick(op,()=>1)]-=2;else goals[scorer]+=goalPts[P[scorer].pc];
          if(random()<assistFraction){
            const elig:number[]=[];for(const i of on)if(i!==scorer)elig.push(i);
            if(elig.length)assists[pick(elig,i=>Math.max(1e-6,.7*P[i].rates[3]+.3*P[i].rates[2]))]+=3;
          }
        }
      }
      let v1=-999,v2=-999,v3=-999;
      for(const i of m.both){
        const p=P[i],ex=mins[i]/90;
        cs[i]=mins[i]>=60&&gc[i]===0?csPts[p.pc]:0;
        if(p.pc<=1)conceded[i]=-Math.floor(gc[i]/2);
        if(p.pc===0)saves[i]=Math.floor(poisson(p.rates[6]*ex)/3);
        const yc=random()<Math.min(.8,p.rates[4]*ex),rc=random()<Math.min(.15,p.rates[5]*ex);
        cards[i]=-(yc?1:0)-(rc?3:0);if(rc)cs[i]=0;
        pen[i]=-2*poisson(p.rates[7]*ex)+(p.pc===0?5*poisson(p.rates[8]*ex):0);
        const b=app[i]+goals[i]+assists[i]+cs[i]+saves[i]+conceded[i]+cards[i]+pen[i]+ownc[i];
        base[i]=b;
        if(mins[i]>0){if(b>v1){v3=v2;v2=v1;v1=b}else if(b<v1&&b>v2){v3=v2;v2=b}else if(b<v2&&b>v3)v3=b}
      }
      let c1=0,c2=0,c3=0;
      for(const i of m.both)if(mins[i]>0){if(base[i]===v1)c1++;else if(base[i]===v2)c2++;else if(base[i]===v3)c3++}
      for(const i of m.both){
        let bon=0;
        if(mins[i]>0){
          if(base[i]===v1)bon=3;
          else if(base[i]===v2&&c1<3)bon=2;
          else if(base[i]===v3&&c1+c2<3)bon=1;
        }
        const fp=base[i]+bon;
        sumXi[i]+=start[i];if(mins[i]>0)sumPlay[i]++;if(mins[i]>=60)sumP60[i]++;
        sumMin[i]+=mins[i];sumCore[i]+=base[i];sumBonus[i]+=bon;sumFP[i]+=fp;if(fp>=6)sumP6[i]++;
        hist[i][Math.max(0,Math.min(bins-1,fp+off))]++;
      }
    }
  }

  const rows = [];
  for(let i=0;i<M;i++) rows.push({
    player_id:P[i].id, sum_xi:sumXi[i], sum_play:sumPlay[i], sum_p60:sumP60[i],
    sum_minutes:sumMin[i], sum_core:sumCore[i], sum_bonus:sumBonus[i], sum_fp:sumFP[i], sum_p6:sumP6[i],
    hist:Array.from(hist[i])
  });

  const {error:mergeError}=await supabase.rpc("merge_replay_sim_chunk",{p_gameweek:GW,p_benchmark:BENCHMARK,p_draws:draws,p_rows:rows});
  if(mergeError) throw mergeError;

  const {data:progress,error:progressError}=await supabase.from("scout_replay_sim_accum").select("draws").eq("gameweek",GW).eq("benchmark_version",BENCHMARK).limit(1).single();
  if(progressError) throw progressError;

  return new Response(JSON.stringify({ok:true,draws_added:draws,total_draws:progress.draws,seed,sim_ms:Date.now()-started}),{headers:{"content-type":"application/json"}});
});