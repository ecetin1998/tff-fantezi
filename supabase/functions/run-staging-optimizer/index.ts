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

import solver from "https://esm.sh/javascript-lp-solver@0.4.24";


function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function buildModel(rows:any[], variant:string, recommendedXI:Set<number>) {
  const constraints:any={
    budget:{max:100}, total:{equal:15}, xiTotal:{equal:11}, capTotal:{equal:1},
    ...(variant==="alternative"?{overlap:{max:8}}:{}),
    squadGK:{equal:2}, squadDEF:{equal:5}, squadMID:{equal:5}, squadFWD:{equal:3},
    xiGK:{equal:1}, xiDEFmin:{min:3}, xiDEFmax:{max:5},
    xiMIDmin:{min:2}, xiMIDmax:{max:5}, xiFWDmin:{min:1}, xiFWDmax:{max:3}
  };
  for(let t=1;t<=18;t++){
    constraints["team_"+t]={max:3};
    constraints["defstack_"+t]={max:2};
  }
  const variables:any={}, ints:any={};
  for(const r of rows){
    const id=Number(r.player_id), pos=String(r.position), team=Number(r.team_id);
    const price=n(r.price), xfp=n(r.xfp), p90=n(r.p90);
    constraints["one_"+id]={max:1};
    constraints["caplink_"+id]={max:0};
    const availability=n(r.availability_probability);
    const minutes=n(r.x_minutes);
    const xiProbability=n(r.xi_probability);
    const playProbability=Math.max(0,Math.min(1,availability*Math.max(xiProbability,Math.min(1,minutes/90))));
    const benchValue=.08*playProbability*xfp;
    const cheapBench=.0001*price;
    const base=variant==="recommended"?xfp:xfp+.18*Math.max(0,p90-xfp);
    const xiEligible=xiProbability>=.5&&minutes>=40;
    if(xiEligible){
      const v:any={score:base-benchValue+cheapBench,budget:price,total:1,xiTotal:1,["squad"+pos]:1,["team_"+team]:1,["one_"+id]:1,["caplink_"+id]:-1};
      if(pos==="GK") v.xiGK=1;
      if(pos==="DEF"){v.xiDEFmin=1;v.xiDEFmax=1}
      if(pos==="MID"){v.xiMIDmin=1;v.xiMIDmax=1}
      if(pos==="FWD"){v.xiFWDmin=1;v.xiFWDmax=1}
      if(pos==="GK"||pos==="DEF")v["defstack_"+team]=1;
      if(variant==="alternative"&&recommendedXI.has(id))v.overlap=1;
      variables["x_"+id]=v;ints["x_"+id]=1;
      variables["c_"+id]={score:variant==="recommended"?xfp:p90,capTotal:1,["caplink_"+id]:1};ints["c_"+id]=1;
    }
    variables["b_"+id]={score:benchValue-cheapBench,budget:price,total:1,["squad"+pos]:1,["team_"+team]:1,["one_"+id]:1};
    ints["b_"+id]=1;
  }
  return {optimize:"score",opType:"max",constraints,variables,ints};
}
function solve(rows:any[],variant:string,recommendedXI:Set<number>){
  const model=buildModel(rows,variant,recommendedXI);
  const out:any=(solver as any).Solve(model);
  if(!out?.feasible) throw new Error("optimizer infeasible "+variant);
  const xi:number[]=[],bench:number[]=[];let captain=0;
  for(const [k,v] of Object.entries(out)){
    if(k==="feasible"||k==="result"||k==="bounded"||k==="isIntegral")continue;
    if(n(v)<.5)continue;
    if(k.startsWith("x_"))xi.push(Number(k.slice(2)));
    else if(k.startsWith("b_"))bench.push(Number(k.slice(2)));
    else if(k.startsWith("c_"))captain=Number(k.slice(2));
  }
  if(xi.length!==11||bench.length!==4||!captain)throw new Error("bad solution shape "+variant+" "+xi.length+"/"+bench.length+"/"+captain);
  return {out,xi,bench,captain};
}
Deno.serve(async(req:Request)=>{
  try{
    const u=new URL(req.url);
    if (!(await gateAuthorized(req))) return Response.json({error:"unauthorized"},{status:401});const mode=(u.searchParams.get("mode")||"recommended").toLowerCase();
    if(!["recommended","alternative"].includes(mode)) return Response.json({error:"bad mode"},{status:400});
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let RUN=u.searchParams.get("run");
    if(!RUN){
      const rr=await sb.from("scout_model_runs").select("id").eq("is_current",true).eq("status","ready").order("generated_at",{ascending:false}).limit(1).single();
      if(rr.error)throw rr.error;
      RUN=rr.data.id;
    }
    const runMeta=await sb.from("scout_model_runs").select("simulation_count,model_version").eq("id",RUN).single();
    if(runMeta.error)throw runMeta.error;
    const {data,error}=await sb.from("scout_player_projections")
      .select("player_id,xfp,p90,xi_probability,x_minutes,availability_probability,confidence,scout_players!inner(team_id,position,price,active)")
      .eq("run_id",RUN);
    if(error)throw error;
    const rows=(data||[]).map((x:any)=>({
      player_id:x.player_id,xfp:x.xfp,p90:x.p90,xi_probability:x.xi_probability,x_minutes:x.x_minutes,availability_probability:x.availability_probability,
      team_id:x.scout_players.team_id,position:x.scout_players.position,price:x.scout_players.price,active:x.scout_players.active,confidence:x.confidence||"medium"
    })).filter((x:any)=>x.active && n(x.availability_probability)>=.8 && n(x.price)>0);
    const byPos:any={GK:[],DEF:[],MID:[],FWD:[]};
    for(const r of rows) byPos[r.position]?.push(r);
    const keep=new Set<number>();
    for(const pos of Object.keys(byPos)){
      const arr=byPos[pos];
      [...arr].sort((a,b)=>n(b.xfp)-n(a.xfp)).slice(0,35).forEach(x=>keep.add(Number(x.player_id)));
      [...arr].sort((a,b)=>n(b.p90)-n(a.p90)||n(b.xfp)-n(a.xfp)).slice(0,35).forEach(x=>keep.add(Number(x.player_id)));
      [...arr].sort((a,b)=>n(a.price)-n(b.price)||n(b.xfp)-n(a.xfp)).slice(0,30).forEach(x=>keep.add(Number(x.player_id)));
    }
    const pool=rows.filter((x:any)=>keep.has(Number(x.player_id)));
    let recommendedXI=new Set<number>();
    if(mode==="alternative"){
      const rr=await sb.from("scout_squad_recommendations").select("id").eq("run_id",RUN).eq("variant","recommended").single();
      if(rr.error)throw rr.error;
      const mm=await sb.from("scout_squad_members").select("player_id,squad_slot").eq("recommendation_id",rr.data.id).eq("squad_slot","XI");
      if(mm.error)throw mm.error;
      recommendedXI=new Set((mm.data||[]).map((x:any)=>Number(x.player_id)));
    }
    const sol=solve(pool,mode,recommendedXI);
    const byId=new Map(pool.map((x:any)=>[Number(x.player_id),x]));
    const old=await sb.from("scout_squad_recommendations").select("id").eq("run_id",RUN).eq("variant",mode);
    if(old.error)throw old.error;
    const oldIds=(old.data||[]).map((x:any)=>x.id);
    if(oldIds.length){const d1=await sb.from("scout_squad_members").delete().in("recommendation_id",oldIds);if(d1.error)throw d1.error}
    const d2=await sb.from("scout_squad_recommendations").delete().eq("run_id",RUN).eq("variant",mode);if(d2.error)throw d2.error;

    const recs:any[]=[];
    for(const [variant,sol2] of [[mode,sol]] as any[]){
      const sol=sol2;
      const id=crypto.randomUUID();
      const xiRows=sol.xi.map((pid:number)=>byId.get(pid));
      const allRows=sol.xi.concat(sol.bench).map((pid:number)=>byId.get(pid));
      const budget=allRows.reduce((s:number,r:any)=>s+n(r.price),0);
      const xiXfp=xiRows.reduce((s:number,r:any)=>s+n(r.xfp),0);
      const cap=byId.get(sol.captain);
      const counts:any={DEF:0,MID:0,FWD:0};
      for(const r of xiRows)if(r.position!=="GK")counts[r.position]=(counts[r.position]||0)+1;
      const formation=`${counts.DEF}-${counts.MID}-${counts.FWD}`;
      const objective=variant==="recommended"?"xi_xfp_bench_ev_v3":"ceiling_p90_bench_ev_v4";
      const sims=Number(runMeta.data.simulation_count||0).toLocaleString("tr-TR");
      const status=variant==="recommended"
        ? `OPTIMAL • availability-integrated • bütçe ≤100m • ${sims} sim • bench puanı dahil değil`
        : `OPTIMAL • availability-integrated • Tavan 11 • P90 odaklı • bütçe ≤100m • ${sims} sim • recommended ile en az 3 farklı`;
      recs.push({id,run_id:RUN,variant,budget,xi_xfp:xiXfp,captain_xfp:xiXfp+n(cap.xfp),formation,objective,status});
      const posOrder:any={GK:0,DEF:1,MID:2,FWD:3};
      const xis=[...sol.xi].sort((a:number,b:number)=>posOrder[byId.get(a).position]-posOrder[byId.get(b).position]||n(byId.get(b).xfp)-n(byId.get(a).xfp));
      const bns=[...sol.bench].sort((a:number,b:number)=>posOrder[byId.get(a).position]-posOrder[byId.get(b).position]||n(byId.get(b).xfp)-n(byId.get(a).xfp));
      const members:any[]=[];
      xis.forEach((pid:number,idx:number)=>{
        const r=byId.get(pid);members.push({recommendation_id:id,player_id:pid,squad_slot:"XI",sort_order:idx+1,is_captain:pid===sol.captain,xfp:n(r.xfp),xi_contribution:n(r.xfp)*(pid===sol.captain?2:1)});
      });
      bns.forEach((pid:number,idx:number)=>{
        const r=byId.get(pid);members.push({recommendation_id:id,player_id:pid,squad_slot:"BENCH",sort_order:idx+1,is_captain:false,xfp:n(r.xfp),xi_contribution:0});
      });
      const ir=await sb.from("scout_squad_recommendations").insert(recs[recs.length-1]);if(ir.error)throw ir.error;
      const im=await sb.from("scout_squad_members").insert(members);if(im.error)throw im.error;
    }
    return Response.json({ok:true,run:RUN,mode,players:rows.length,pool:pool.length,xi:sol.xi,bench:sol.bench,captain:sol.captain});
  }catch(e:any){return Response.json({error:String(e?.message||e)},{status:500})}
});