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


const SOURCE="fresh-current-logic+cold-start-v1-2026-09-24";
const FEATURES=[
  "xfp","pmin","p6","p90","p75","price","role","benchw",
  "recent2_pts","recent4_pts","recent2_min","recent4_sd",
  "xg90","g90","a90","xa90","yc90","rc90","saves90","shots90","sot90",
  "team_lambda","opp_lambda","cs_prob","isGK","isDEF","isMID","isFWD",
  "xgMin","gMin","aMin","sotMin","csMin",
  "xfpMID","xfpFWD","xfpDEF","xfpGK","formMID","formFWD"
];
const LR=.08, N_STUMPS=80;

function mean(a:number[]){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sdpop(a:number[]){if(!a.length)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length)}
function quant(hist:any,q:number){
  const arr=Array.isArray(hist)?hist.map(Number):[];
  const n=arr.reduce((a,b)=>a+b,0);
  if(!n)return 0;
  const t=n*q; let c=0;
  for(let i=0;i<arr.length;i++){c+=arr[i];if(c>=t)return i-40}
  return arr.length-1-40;
}
function zvals(a:number[]){
  const m=mean(a),s=sdpop(a)||1;
  return a.map(x=>(x-m)/s);
}
function topActual(rows:any[]){
  return [...rows].sort((a,b)=>(b.actual_points-a.actual_points)||(a.player_id-b.player_id));
}
function train(rows:any[],minLeaf:number){
  const n=rows.length;
  const y=rows.map(r=>r.y);
  const base=mean(y);
  const pred=new Float64Array(n); pred.fill(base);
  const orders:any={};
  for(const f of FEATURES){
    orders[f]=Array.from({length:n},(_,i)=>i).sort((i,j)=>(rows[i][f]-rows[j][f])||(i-j));
  }
  const stumps:any[]=[];
  for(let s=0;s<N_STUMPS;s++){
    const resid=new Float64Array(n);
    let total=0,total2=0;
    for(let i=0;i<n;i++){const r=y[i]-pred[i];resid[i]=r;total+=r;total2+=r*r}
    let best:any=null;
    for(const f of FEATURES){
      const ord:number[]=orders[f];
      let nl=0,sl=0,sl2=0;
      for(let k=0;k<n-1;k++){
        const i=ord[k],r=resid[i]; nl++;sl+=r;sl2+=r*r;
        const v=Number(rows[i][f])||0, vn=Number(rows[ord[k+1]][f])||0;
        if(v===vn)continue;
        const nr=n-nl;if(nl<minLeaf||nr<minLeaf)continue;
        const sr=total-sl;
        const gain=(sl*sl/nl)+(sr*sr/nr)-(total*total/n);
        if(!best || gain>best.gain+1e-12){
          best={feature:f,threshold:v,left:sl/nl,right:sr/nr,gain};
        }
      }
    }
    if(!best)break;
    stumps.push(best);
    for(let i=0;i<n;i++) pred[i]+=LR*((Number(rows[i][best.feature])||0)<=best.threshold?best.left:best.right);
  }
  return {base,stumps};
}
function gbRaw(row:any,model:any){
  let v=model.base;
  for(const s of model.stumps)v+=LR*((Number(row[s.feature])||0)<=s.threshold?s.left:s.right);
  return v;
}

Deno.serve(async(req:Request)=>{
  try{
    const u=new URL(req.url);
    if (!(await gateAuthorized(req))) return Response.json({error:"unauthorized"},{status:401});const target=Number(u.searchParams.get("gw")||"6");
    const minLeaf=Math.max(1,Math.min(200,Number(u.searchParams.get("min_leaf")||"1")));
    const mode=(u.searchParams.get("mode")||"canonical").toLowerCase();
    const bench=u.searchParams.get("benchmark")||"dist-screen-nb-s100-v1";
    if(!Number.isInteger(target)||target<2||target>6)return Response.json({error:"gw must be 2..6"},{status:400});
    if(!["canonical","accum"].includes(mode))return Response.json({error:"mode canonical|accum"},{status:400});

    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const weekRows:any[]=[];
    const weekly:any[]=[];

    for(let w=1;w<=target;w++){
      const [pq,iq,mq,aq]=await Promise.all([
        sb.from("scout_replay_players").select("gameweek,player_id,player_name,predicted_xfp,predicted_minutes,predicted_six_plus,predicted_p75,predicted_p90,actual_points")
          .eq("gameweek",w).eq("benchmark_version",SOURCE),
        sb.from("scout_replay_player_inputs").select("gameweek,player_id,club_id,position,price,role_probability,bench_weight,rates")
          .eq("gameweek",w).eq("benchmark_version",SOURCE),
        sb.from("scout_replay_match_inputs").select("home_team_id,away_team_id,home_lambda,away_lambda")
          .eq("gameweek",w).eq("benchmark_version",SOURCE),
        (mode==="accum" && w>=2)
          ? sb.from("scout_replay_sim_accum").select("player_id,draws,sum_fp,sum_minutes,sum_p6,hist")
              .eq("gameweek",w).eq("benchmark_version",bench)
          : Promise.resolve({data:[],error:null})
      ]);
      for(const q of [pq,iq,mq,aq])if((q as any).error)throw (q as any).error;
      const pmap=new Map<number,any>((pq.data||[]).map((x:any)=>[Number(x.player_id),x]));
      const amap=new Map<number,any>(((aq as any).data||[]).map((x:any)=>[Number(x.player_id),x]));
      const side=new Map<number,{team:number,opp:number}>();
      for(const m of mq.data||[]){
        side.set(Number(m.home_team_id),{team:Number(m.home_lambda),opp:Number(m.away_lambda)});
        side.set(Number(m.away_team_id),{team:Number(m.away_lambda),opp:Number(m.home_lambda)});
      }
      for(const i of iq.data||[]){
        const p=pmap.get(Number(i.player_id)); if(!p)continue;
        const a=amap.get(Number(i.player_id));
        const metric=(mode==="accum" && w>=2 && a)
          ? {xfp:Number(a.sum_fp)/Number(a.draws),pmin:Number(a.sum_minutes)/Number(a.draws),p6:Number(a.sum_p6)/Number(a.draws),p75:quant(a.hist,.75),p90:quant(a.hist,.90)}
          : {xfp:Number(p.predicted_xfp)||0,pmin:Number(p.predicted_minutes)||0,p6:Number(p.predicted_six_plus)||0,p75:Number(p.predicted_p75)||0,p90:Number(p.predicted_p90)||0};
        const ms=side.get(Number(i.club_id))||{team:1.3,opp:1.3};
        weekRows.push({w,inp:i,p,metric,team_lambda:ms.team,opp_lambda:ms.opp});
      }
      if(w<target){
        const wq=await sb.from("scout_player_weekly_points").select("player_id,gameweek,points,minutes,is_final")
          .eq("gameweek",w).eq("is_final",true);
        if(wq.error)throw wq.error;
        weekly.push(...(wq.data||[]));
      }
    }

    const byPlayer=new Map<number,any[]>();
    for(const x of weekly){
      const id=Number(x.player_id); if(!byPlayer.has(id))byPlayer.set(id,[]);
      byPlayer.get(id)!.push({gw:Number(x.gameweek),points:Number(x.points)||0,minutes:Number(x.minutes)||0});
    }
    for(const a of byPlayer.values())a.sort((x,y)=>x.gw-y.gw);

    function recent(id:number,w:number){
      const all=(byPlayer.get(id)||[]).filter(x=>x.gw<w);
      const played=all.filter(x=>x.minutes>0).sort((a,b)=>b.gw-a.gw);
      const any=[...all].sort((a,b)=>b.gw-a.gw);
      return {
        recent2_pts:mean(played.slice(0,2).map(x=>x.points)),
        recent4_pts:mean(played.slice(0,4).map(x=>x.points)),
        recent2_min:mean(any.slice(0,2).map(x=>x.minutes)),
        recent4_sd:sdpop(played.slice(0,4).map(x=>x.points))
      };
    }
    function feat(x:any){
      const i=x.inp,m=x.metric,r=recent(Number(i.player_id),x.w);
      const rates=Array.isArray(i.rates)?i.rates.map(Number):Array(12).fill(0);
      const pos=String(i.position);
      const f:any={
        player_id:Number(i.player_id),player_name:x.p.player_name||"",position:pos,
        actual_points:Number(x.p.actual_points)||0,
        xfp:m.xfp,pmin:m.pmin,p6:m.p6,p90:m.p90,p75:m.p75,
        price:Number(i.price)||0,role:Number(i.role_probability)||0,benchw:Number(i.bench_weight)||0,
        ...r,
        xg90:rates[0]||0,g90:rates[1]||0,a90:rates[2]||0,xa90:rates[3]||0,
        yc90:rates[4]||0,rc90:rates[5]||0,saves90:rates[6]||0,shots90:rates[10]||0,sot90:rates[11]||0,
        team_lambda:x.team_lambda,opp_lambda:x.opp_lambda,cs_prob:Math.exp(-x.opp_lambda),
        isGK:pos==="GK"?1:0,isDEF:pos==="DEF"?1:0,isMID:pos==="MID"?1:0,isFWD:pos==="FWD"?1:0
      };
      f.xgMin=f.xg90*f.pmin/90;f.gMin=f.g90*f.pmin/90;f.aMin=f.a90*f.pmin/90;f.sotMin=f.sot90*f.pmin/90;f.csMin=f.cs_prob*f.pmin/90;
      f.xfpMID=f.xfp*f.isMID;f.xfpFWD=f.xfp*f.isFWD;f.xfpDEF=f.xfp*f.isDEF;f.xfpGK=f.xfp*f.isGK;
      f.formMID=f.recent2_pts*f.isMID;f.formFWD=f.recent2_pts*f.isFWD;
      f.y=f.actual_points>=6?1:0;
      return f;
    }

    const trainRows=weekRows.filter(x=>x.w<target).map(feat);
    const testRows=weekRows.filter(x=>x.w===target).map(feat);
    if(!trainRows.length||!testRows.length)return Response.json({error:"missing train/test rows",train:trainRows.length,test:testRows.length},{status:409});
    const model=train(trainRows,minLeaf);

    const zx=zvals(testRows.map(r=>r.xfp));
    const raw=testRows.map(r=>gbRaw(r,model));
    const zg=zvals(raw);
    const scored=testRows.map((r,i)=>{
      const off=r.position==="FWD"?.4:r.position==="GK"?-.3:r.position==="DEF"?-.1:0;
      return {...r,gb_raw:raw[i],score:zx[i]+.75*zg[i]+off};
    }).sort((a,b)=>(b.score-a.score)||(a.player_id-b.player_id));
    const actual=topActual(testRows);
    const actualTop=new Set(actual.slice(0,25).map(r=>r.player_id));
    const predTop=scored.slice(0,25);
    const hits=predTop.filter(r=>actualTop.has(r.player_id)).length;

    return Response.json({
      ok:true,target_gw:target,mode,min_leaf:minLeaf,benchmark:mode==="accum"?bench:null,
      train_rows:trainRows.length,test_rows:testRows.length,base:model.base,stumps:model.stumps.length,
      first_stumps:model.stumps.slice(0,3),
      hits,hit_rate:hits/25,
      predicted_top25:predTop.map((r,idx)=>({rank:idx+1,player_id:r.player_id,name:r.player_name,score:r.score,xfp:r.xfp,p6:r.p6,p90:r.p90,actual_points:r.actual_points})),
      actual_top25:actual.slice(0,25).map((r,idx)=>({rank:idx+1,player_id:r.player_id,name:r.player_name,actual_points:r.actual_points}))
    });
  }catch(e:any){return Response.json({error:String(e?.message||e),stack:String(e?.stack||"").slice(0,1000)},{status:500})}
});