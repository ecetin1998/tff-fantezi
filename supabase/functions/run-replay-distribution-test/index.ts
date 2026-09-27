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
    !["workflow_dispatch","schedule"].includes(String(payload.event_name||""))
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


const DEFAULT_SOURCE = "fresh-current-logic+cold-start-v1-2026-09-24";

function clamp(x:number,a:number,b:number){ return Math.max(a,Math.min(b,x)); }

Deno.serve(async (req: Request) => {
  try {
    if (!(await gateAuthorized(req))) return Response.json({error:"unauthorized"},{status:401});
    const url = new URL(req.url);
    const gw = Number(url.searchParams.get("gw") || "6");
    const SOURCE = url.searchParams.get("source") || DEFAULT_SOURCE;
    const rawAlphaOverride = Number(url.searchParams.get("raw_alpha") ?? "NaN");
    const roleRun = url.searchParams.get("role_run");
    const draws = Math.max(1, Math.min(10000, Number(url.searchParams.get("draws") || "10000")));
    const seed = (Number(url.searchParams.get("seed") || String(20260925 + gw * 1000)) >>> 0);
    const dist = (url.searchParams.get("dist") || "nb").toLowerCase();
    const scale = Math.max(0, Math.min(3, Number(url.searchParams.get("scale") || "1.0")));
    const shareKappa = Math.max(0, Math.min(1000, Number(url.searchParams.get("share_kappa") || "0")));
    const bimodal = url.searchParams.get("bimodal") === "1";
    const lowMinuteThreshold = Math.max(15, Math.min(45, Number(url.searchParams.get("low_thresh") || "35")));
    const lowStarterFloor = Math.max(45, Math.min(75, Number(url.searchParams.get("starter_floor") || "60")));
    const lowBenchKeep = Math.max(0, Math.min(1, Number(url.searchParams.get("bench_keep") || "1")));
    const target = url.searchParams.get("target") || `${SOURCE}+${dist}-s${scale}`;
    if (!Number.isInteger(gw) || gw < 1 || gw > 7) {
      return Response.json({error:"gw must be 1..7"},{status:400});
    }
    if (!["poisson","nb"].includes(dist)) {
      return Response.json({error:"dist must be poisson or nb"},{status:400});
    }

    const forceSource = url.searchParams.get("force_source") === "1";
    const sourceBenchmark = (gw===7 && !forceSource) ? "fresh-current-mh7-role-continuity-v1-2026-09-25" : SOURCE;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [inpQ,matchQ,metaQ,priorMatchQ,histQ,canonQ,roleQ,availabilityQ] = await Promise.all([
      supabase.from("scout_replay_player_inputs").select("*")
        .eq("gameweek",gw).eq("benchmark_version",sourceBenchmark).order("player_id"),
      supabase.from("scout_replay_match_inputs").select("*")
        .eq("gameweek",gw).eq("benchmark_version",sourceBenchmark).order("match_id"),
      supabase.from("scout_replay_input_meta").select("*")
        .eq("gameweek",gw).eq("benchmark_version",sourceBenchmark).single(),
      gw > 1
        ? supabase.from("scout_replay_match_inputs").select("gameweek,match_id,home_lambda,away_lambda")
            .lt("gameweek",gw).eq("benchmark_version",sourceBenchmark).order("gameweek").order("match_id")
        : Promise.resolve({data:[],error:null}),
      gw > 1
        ? supabase.from("scout_match_history").select("gameweek,match_id,home_goals,away_goals")
            .lt("gameweek",gw).order("gameweek").order("match_id")
        : Promise.resolve({data:[],error:null}),
      gw===7
        ? supabase.from("scout_player_projections").select("player_id,x_minutes").eq("run_id","7c3f7a10-0925-47c1-8001-000000000007")
        : supabase.from("scout_replay_players").select("player_id,predicted_minutes")
            .eq("gameweek",gw).eq("benchmark_version",sourceBenchmark),
      roleRun
        ? supabase.from("scout_role_signals").select("player_id,predicted_xi_probability,x_minutes,availability_probability").eq("run_id",roleRun)
        : Promise.resolve({data:[],error:null}),
      roleRun
        ? supabase.from("scout_availability").select("player_id,availability_probability").eq("run_id",roleRun)
        : Promise.resolve({data:[],error:null})
    ]);
    for (const q of [inpQ,matchQ,metaQ,priorMatchQ,histQ,canonQ,roleQ,availabilityQ]) if ((q as any).error) throw (q as any).error;

    const inputs:any[] = inpQ.data || [];
    const rawMatches:any[] = matchQ.data || [];
    const meta:any = metaQ.data || {};
    if (!inputs.length || rawMatches.length !== 9) {
      return Response.json({error:"source coverage mismatch",players:inputs.length,matches:rawMatches.length},{status:409});
    }

    let alphaRaw = Number.isFinite(rawAlphaOverride) ? Math.max(0,Math.min(1.5,rawAlphaOverride)) : 0;
    if (!Number.isFinite(rawAlphaOverride) && gw > 1) {
      const actualByMatch = new Map<number,any>();
      for (const h of (histQ as any).data || []) actualByMatch.set(Number(h.match_id),h);
      let num = 0, den = 0, n = 0;
      for (const m of (priorMatchQ as any).data || []) {
        const h = actualByMatch.get(Number(m.match_id));
        if (!h || h.home_goals == null || h.away_goals == null) continue;
        const vals = [
          [Number(m.home_lambda), Number(h.home_goals)],
          [Number(m.away_lambda), Number(h.away_goals)]
        ];
        for (const [mu,y] of vals) {
          if (!(mu > 0) || !Number.isFinite(y)) continue;
          num += (y-mu)*(y-mu) - mu;
          den += mu*mu;
          n++;
        }
      }
      alphaRaw = den > 0 ? Math.max(0, num/den) : 0;
      // Prevent one tiny early sample from producing a pathological tail.
      alphaRaw = clamp(alphaRaw,0,1.5);
    }
    const alpha = dist === "nb" ? alphaRaw * scale : 0;

    const posCode:any = {GK:0,DEF:1,MID:2,FWD:3};
    const goalPts = [10,6,5,4], csPts = [4,4,1,0];

    const fixedFormations:any = Object.fromEntries(
      Array.from({length:18},(_,k)=>[String(k+1),{GK:1,DEF:4,MID:5,FWD:1}])
    );
    const formations:any = roleRun ? (meta.team_formations || meta.formations || fixedFormations) : fixedFormations;
    const temp = Math.max(.25, Number(meta.temperature) || 1.7);
    const assistFraction = clamp(Number(meta.assist_fraction) || .7,0,1);
    const ownFraction = clamp(Number(meta.own_goal_fraction) || 0,0,.2);
    const canonicalMin = new Map<number,number>();
    for(const x of (canonQ as any).data || []) canonicalMin.set(Number(x.player_id),Number(x.predicted_minutes ?? x.x_minutes)||0);
    const roleMap = new Map<number,any>();
    for(const x of (roleQ as any).data || []) roleMap.set(Number(x.player_id),x);
    const availabilityMap = new Map<number,number>();
    for(const x of (availabilityQ as any).data || []) availabilityMap.set(Number(x.player_id),clamp(Number(x.availability_probability ?? 1),0,1));

    const P = inputs.map((x:any) => {
      const rm=roleMap.get(Number(x.player_id));
      const av=clamp(Number(availabilityMap.get(Number(x.player_id)) ?? rm?.availability_probability ?? x.availability) || 0,0,1);
      const rp = clamp((Number(x.role_probability)||0) * av, 1e-7, .9999999);
      const durations = Array.isArray(x.durations) && x.durations.length ? x.durations.map(Number) : [75];
      let weights = Array.isArray(x.duration_weights) && x.duration_weights.length===durations.length
        ? x.duration_weights.map((v:any)=>Math.max(0,Number(v)||0)) : durations.map(()=>1);
      const sw = weights.reduce((a:number,b:number)=>a+b,0) || 1;
      weights = weights.map((v:number)=>v/sw);
      return {
        id:Number(x.player_id), club:Number(x.club_id), pos:String(x.position), pc:posCode[String(x.position)],
        logit:Math.log(rp/(1-rp))/temp,
        availability:av,
        benchw:Math.max(0,(Number(x.bench_weight)||0) * av),
        targetXi:Number.isFinite(Number(rm?.predicted_xi_probability))
          ? clamp(Number(rm?.predicted_xi_probability) * av,0,1)
          : NaN,
        targetMin:Number(rm?.x_minutes ?? canonicalMin.get(Number(x.player_id)) ?? 0),
        durations, weights,
        rates:Array.isArray(x.rates) ? x.rates.map(Number) : Array(12).fill(0)
      };
    });
    const M=P.length;

    const teamsIdx=Array.from({length:19},()=>[] as number[]);
    const groups=Array.from({length:19},()=>[[],[],[],[]] as number[][]);
    for(let i=0;i<M;i++){
      if (P[i].club<1 || P[i].club>18 || P[i].pc===undefined) continue;
      teamsIdx[P[i].club].push(i);
      groups[P[i].club][P[i].pc].push(i);
    }

    const activeGroups=Array.from({length:19},(_,c)=>
      [0,1,2,3].map(pc=>groups[c][pc].filter(i=>P[i].availability>0))
    );
    const resolvedFormations:any={};
    for(let c=1;c<=18;c++){
      const base=formations[String(c)] || formations[c] || {GK:1,DEF:4,MID:5,FWD:1};
      const q=[Number(base.GK)||0,Number(base.DEF)||0,Number(base.MID)||0,Number(base.FWD)||0];
      const caps=[0,1,2,3].map(pc=>activeGroups[c][pc].length);
      for(let pc=0;pc<4;pc++) q[pc]=Math.min(q[pc],caps[pc]);
      let need=11-q.reduce((a,b)=>a+b,0);
      while(need>0){
        let best=-1,bestScore=-Infinity;
        for(let pc=0;pc<4;pc++){
          if(q[pc]>=caps[pc]) continue;
          if(pc===0 && q[pc]>=1) continue;
          const residual=activeGroups[c][pc]
            .map(i=>Number.isFinite(P[i].targetXi)?P[i].targetXi:1/(1+Math.exp(-P[i].logit)))
            .sort((a,b)=>b-a)
            .slice(q[pc])
            .reduce((a,b)=>a+b,0);
          if(residual>bestScore){bestScore=residual;best=pc}
        }
        if(best<0) throw new Error("insufficient active lineup pool club "+c);
        q[best]++; need--;
      }
      resolvedFormations[String(c)]={GK:q[0],DEF:q[1],MID:q[2],FWD:q[3]};
    }

    const matches=rawMatches.map((m:any)=>({
      home_id:Number(m.home_team_id), away_id:Number(m.away_team_id),
      hl:Number(m.home_lambda), al:Number(m.away_lambda),
      home:teamsIdx[Number(m.home_team_id)], away:teamsIdx[Number(m.away_team_id)],
      both:teamsIdx[Number(m.home_team_id)].concat(teamsIdx[Number(m.away_team_id)])
    }));

    let state=seed>>>0;
    const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return(state+.5)/4294967296};
    const normal=()=>{
      let u=0,v=0;
      while(u<=1e-12)u=random();
      while(v<=1e-12)v=random();
      return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    };
    const gamma=(shape:number)=>{
      if (!(shape>0)) return 0;
      if (shape < 1) return gamma(shape+1)*Math.pow(random(),1/shape);
      const d=shape-1/3, c=1/Math.sqrt(9*d);
      while(true){
        let x=normal(), v=1+c*x;
        if(v<=0) continue;
        v=v*v*v;
        const u=random();
        if(u < 1-.0331*x*x*x*x) return d*v;
        if(Math.log(u) < .5*x*x + d*(1-v+Math.log(v))) return d*v;
      }
    };
    const poisson=(l:number)=>{
      l=Math.max(0,l);
      if (l===0) return 0;
      let n=0,t=1,L=Math.exp(-l);
      do{n++;t*=random()}while(t>L);
      return n-1;
    };
    const teamGoals=(mu:number)=>{
      if (!(alpha>1e-10)) return poisson(mu);
      const shape=1/alpha;
      const lambda=gamma(shape)*(alpha*mu);
      return poisson(lambda);
    };
    const weightedPick=(arr:number[],wf:(i:number)=>number)=>{
      if(!arr.length) return -1;
      let s=0;for(const i of arr)s+=Math.max(0,wf(i));
      if(s<=0) return arr[Math.floor(random()*arr.length)];
      let u=random()*s;
      for(const i of arr){u-=Math.max(0,wf(i));if(u<=0)return i}
      return arr[arr.length-1];
    };
    const choose=(arr:number[],k:number)=>{
      if(k<=0) return [] as number[];
      k=Math.min(k,arr.length);
      if(roleRun && arr.every(i=>Number.isFinite(P[i].targetXi))){
        const order=arr.slice();
        for(let z=order.length-1;z>0;z--){const j=Math.floor(random()*(z+1));const t=order[z];order[z]=order[j];order[j]=t}
        const pi=order.map(i=>P[i].availability>0 ? clamp(P[i].targetXi,0,P[i].availability) : 0);
        let diff=k-pi.reduce((a,b)=>a+b,0);
        for(let pass=0;pass<4 && Math.abs(diff)>1e-9;pass++){
          const room=pi.map((v,z)=>{
            const cap=P[order[z]].availability;
            return cap>0 ? (diff>0?Math.max(0,cap-v):v) : 0;
          });
          const sr=room.reduce((a,b)=>a+b,0);
          if(sr<=1e-12) break;
          for(let z=0;z<pi.length;z++) pi[z]=clamp(pi[z]+diff*(room[z]/sr),0,1);
          diff=k-pi.reduce((a,b)=>a+b,0);
        }
        const u=random(), chosen:number[]=[];
        let cum=0, j=0;
        for(let z=0;z<order.length && j<k;z++){
          const next=cum+pi[z];
          while(j<k && u+j < next-1e-12){ if(u+j>=cum-1e-12) chosen.push(order[z]); j++; }
          cum=next;
        }
        if(chosen.length===k) return chosen;
      }
      const ranked=arr.map(i=>({i,key:P[i].logit-Math.log(-Math.log(random()))}))
        .sort((a,b)=>b.key-a.key);
      return ranked.slice(0,k).map(x=>x.i);
    };
    const sampleDuration=(i:number)=>{
      const p=P[i]; let u=random();
      for(let j=0;j<p.durations.length;j++){
        u-=p.weights[j];
        if(u<=0){
          let d=clamp(Number(p.durations[j])||0,0,90);
          if(bimodal && p.targetMin>=15 && p.targetMin<lowMinuteThreshold) d=Math.max(d,lowStarterFloor);
          return d;
        }
      }
      let d=clamp(Number(p.durations[p.durations.length-1])||0,0,90);
      if(bimodal && p.targetMin>=15 && p.targetMin<lowMinuteThreshold) d=Math.max(d,lowStarterFloor);
      return d;
    };

    const sumXi=new Float64Array(M),sumPlay=new Float64Array(M),sumP60=new Float64Array(M),
      sumMin=new Float64Array(M),sumCore=new Float64Array(M),sumBonus=new Float64Array(M),
      sumFP=new Float64Array(M),sumP6=new Float64Array(M);
    const off=40,bins=181;
    const hist=Array.from({length:M},()=>new Uint32Array(bins));
    const mins=new Float64Array(M),enter=new Float64Array(M),leave=new Float64Array(M);
    const goalShare=new Float64Array(M),assistShare=new Float64Array(M);
    const start=new Uint8Array(M),used=new Uint8Array(M),gc=new Int16Array(M),base=new Int16Array(M);
    const app=new Int8Array(M),goals=new Int16Array(M),assists=new Int16Array(M),cs=new Int8Array(M),
      saves=new Int16Array(M),conceded=new Int8Array(M),cards=new Int8Array(M),pen=new Int16Array(M),ownc=new Int8Array(M);

    const started=Date.now();
    for(let draw=0;draw<draws;draw++){
      mins.fill(0);enter.fill(91);leave.fill(0);start.fill(0);used.fill(0);
      app.fill(0);goals.fill(0);assists.fill(0);cs.fill(0);saves.fill(0);conceded.fill(0);cards.fill(0);pen.fill(0);ownc.fill(0);

      for(let c=1;c<=18;c++){
        const f=resolvedFormations[String(c)] || {GK:1,DEF:4,MID:5,FWD:1};
        const qs=[Number(f.GK)||0,Number(f.DEF)||0,Number(f.MID)||0,Number(f.FWD)||0];
        for(let pc=0;pc<4;pc++){
          const chosen=choose(activeGroups[c][pc],qs[pc]);
          for(const i of chosen){
            used[i]=1;start[i]=1;enter[i]=0;
            leave[i]=P[i].pc===0?90:sampleDuration(i);
          }
        }
        const starters:number[]=[];
        for(const i of teamsIdx[c]) if(start[i] && leave[i]<90) starters.push(i);
        starters.sort((a,b)=>leave[a]-leave[b]);
        let subs=0;
        for(const i of starters){
          if(subs>=5){leave[i]=90;continue}
          const cand:number[]=[];
          for(const j of groups[c][P[i].pc]) if(!used[j] && P[j].pc!==0 && P[j].availability>0 && P[j].benchw>0) cand.push(j);
          if(!cand.length){leave[i]=90;continue}
          const j=weightedPick(cand,j=>P[j].benchw);
          if(j<0){leave[i]=90;continue}
          if(bimodal && P[j].targetMin>=15 && P[j].targetMin<lowMinuteThreshold && random()>lowBenchKeep){
            leave[i]=90;
            continue;
          }
          enter[j]=leave[i];leave[j]=90;used[j]=1;subs++;
        }
        for(const i of teamsIdx[c]){
          mins[i]=Math.max(0,leave[i]-enter[i]);
          app[i]=(mins[i]>0?1:0)+(mins[i]>60?1:0);
        }
      }

      for(const m of matches){
        gc.fill(0);
        if(shareKappa>0){
          for(const i of m.both){
            goalShare[i]=gamma(shareKappa)/shareKappa;
            assistShare[i]=gamma(shareKappa)/shareKappa;
          }
        } else {
          for(const i of m.both){goalShare[i]=1;assistShare[i]=1}
        }
        for(const i of m.both){base[i]=0;goals[i]=0;assists[i]=0;cs[i]=0;saves[i]=0;conceded[i]=0;cards[i]=0;pen[i]=0;ownc[i]=0}
        const scores=[teamGoals(m.hl),teamGoals(m.al)];
        for(let side=0;side<2;side++){
          const ids=side===0?m.home:m.away,opp=side===0?m.away:m.home;
          for(let e=0;e<scores[side];e++){
            const tm=random()*90,on:number[]=[],op:number[]=[];
            for(const i of ids) if(enter[i]<=tm && leave[i]>tm) on.push(i);
            for(const i of opp) if(enter[i]<=tm && leave[i]>tm){op.push(i);gc[i]++}
            if(!on.length) continue;
            const scorer=weightedPick(on,i=>Math.max(1e-6,((P[i].rates[0]||0)+.15*(P[i].rates[1]||0)+.10*(P[i].rates[11]||0)+.025*(P[i].rates[10]||0))*goalShare[i]));
            if(random()<ownFraction && op.length){
              const oi=weightedPick(op,()=>1); if(oi>=0) ownc[oi]-=2;
            } else if(scorer>=0) goals[scorer]+=goalPts[P[scorer].pc];
            if(scorer>=0 && random()<assistFraction){
              const elig=on.filter(i=>i!==scorer);
              if(elig.length){
                const ai=weightedPick(elig,i=>Math.max(1e-6,(.7*(P[i].rates[3]||0)+.3*(P[i].rates[2]||0))*assistShare[i]));
                if(ai>=0) assists[ai]+=3;
              }
            }
          }
        }

        let v1=-999,v2=-999,v3=-999;
        for(const i of m.both){
          const p=P[i],ex=mins[i]/90;
          cs[i]=mins[i]>=60 && gc[i]===0 ? csPts[p.pc] : 0;
          if(p.pc<=1) conceded[i]=-Math.floor(gc[i]/2);
          if(p.pc===0) saves[i]=Math.floor(poisson(Math.max(0,(p.rates[6]||0)*ex))/3);
          const yc=random()<Math.min(.8,Math.max(0,(p.rates[4]||0)*ex));
          const rc=random()<Math.min(.15,Math.max(0,(p.rates[5]||0)*ex));
          cards[i]=-(yc?1:0)-(rc?3:0); if(rc) cs[i]=0;
          pen[i]=-2*poisson(Math.max(0,(p.rates[7]||0)*ex))+(p.pc===0?5*poisson(Math.max(0,(p.rates[8]||0)*ex)):0);
          const b=app[i]+goals[i]+assists[i]+cs[i]+saves[i]+conceded[i]+cards[i]+pen[i]+ownc[i];
          base[i]=b;
          if(mins[i]>0){
            if(b>v1){v3=v2;v2=v1;v1=b}
            else if(b<v1&&b>v2){v3=v2;v2=b}
            else if(b<v2&&b>v3)v3=b;
          }
        }
        let c1=0,c2=0;
        for(const i of m.both) if(mins[i]>0){if(base[i]===v1)c1++;else if(base[i]===v2)c2++}
        for(const i of m.both){
          let bon=0;
          if(mins[i]>0){
            if(base[i]===v1)bon=3;
            else if(base[i]===v2&&c1<3)bon=2;
            else if(base[i]===v3&&c1+c2<3)bon=1;
          }
          const fp=base[i]+bon;
          sumXi[i]+=start[i]; if(mins[i]>0)sumPlay[i]++; if(mins[i]>=60)sumP60[i]++;
          sumMin[i]+=mins[i]; sumCore[i]+=base[i]; sumBonus[i]+=bon; sumFP[i]+=fp; if(fp>=6)sumP6[i]++;
          hist[i][Math.max(0,Math.min(bins-1,Math.round(fp)+off))]++;
        }
      }
    }

    const rows:any[]=[];
    for(let i=0;i<M;i++) rows.push({
      player_id:P[i].id,sum_xi:sumXi[i],sum_play:sumPlay[i],sum_p60:sumP60[i],
      sum_minutes:sumMin[i],sum_core:sumCore[i],sum_bonus:sumBonus[i],sum_fp:sumFP[i],sum_p6:sumP6[i],
      hist:Array.from(hist[i])
    });
    const {error:mergeError}=await supabase.rpc("merge_replay_sim_chunk",{
      p_gameweek:gw,p_benchmark:target,p_draws:draws,p_rows:rows
    });
    if(mergeError) throw mergeError;

    return Response.json({
      ok:true,gw,draws,seed,dist,scale,target,players:M,
      alpha_raw:alphaRaw,alpha_used:alpha,share_kappa:shareKappa,prior_sides:gw>1?((priorMatchQ as any).data||[]).length*2:0,resolved_formations:resolvedFormations,
      sim_ms:Date.now()-started
    });
  } catch(e:any) {
    return Response.json({error:String(e?.message||e)},{status:500});
  }
});
