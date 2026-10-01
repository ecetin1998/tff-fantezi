import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import solver from "https://esm.sh/javascript-lp-solver@0.4.24";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Content-Type":"application/json",
};
const CARD_CONFIG:any={
  triple_captain:{captainMultiplier:3,benchBoost:false,attack:false,unlimited:false},
  quad_captain:{captainMultiplier:4,benchBoost:false,attack:false,unlimited:false},
  bench_boost:{captainMultiplier:2,benchBoost:true,attack:false,unlimited:false},
  attack:{captainMultiplier:2,benchBoost:false,attack:true,unlimited:false},
  unlimited_budget:{captainMultiplier:2,benchBoost:false,attack:false,unlimited:true},
};
const AGGRESSIVE_XFP_FLOOR=.965;
const AGGRESSIVE_MIN_OVERLAP=7;
const AGGRESSIVE_MAX_OVERLAP=9;

function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function metricScale(rows:any[]){
  const maxXfp=Math.max(1e-9,...rows.map(r=>n(r.xfp)));
  const maxP90=Math.max(1e-9,...rows.map(r=>n(r.p90)));
  const top25=rows.map(r=>n(r.top25_score));
  return {maxXfp,maxP90,minTop25:Math.min(...top25),maxTop25:Math.max(...top25)};
}
function top25Norm(row:any,scale:any){
  const span=Math.max(1e-9,scale.maxTop25-scale.minTop25);
  return Math.max(0,Math.min(1,(n(row.top25_score)-scale.minTop25)/span));
}
function aggressiveScore(row:any,scale:any,captain=false){
  const xfp=Math.max(0,n(row.xfp))/scale.maxXfp;
  const p90=Math.max(0,n(row.p90))/scale.maxP90;
  const six=Math.max(0,Math.min(1,n(row.six_plus_probability)));
  const top25=top25Norm(row,scale);
  return captain
    ?.30*xfp+.45*p90+.15*six+.10*top25
    :.60*xfp+.20*p90+.10*six+.10*top25;
}
function xiBounds(formations:string[]){
  const rows=formations.map(f=>{
    const [DEF,MID,FWD]=String(f).split("-").map(Number);
    return {GK:1,DEF,MID,FWD};
  });
  const out:any={};
  for(const pos of ["GK","DEF","MID","FWD"]){
    out[pos]={min:Math.min(...rows.map(r=>r[pos])),max:Math.max(...rows.map(r=>r[pos]))};
  }
  return out;
}
function effectiveRules(rules:any,card:any){
  const formations=[...(Array.isArray(rules.formations)?rules.formations.map(String):[])];
  if(card.attack&&!formations.includes("2-5-3"))formations.push("2-5-3");
  const baseBudget=n(rules.budget);
  return {
    ...rules,
    squad:card.attack?{GK:2,DEF:3,MID:5,FWD:5}:(rules.squad||{}),
    formations,
    effectiveBudget:card.unlimited?null:(card.attack?baseBudget+5:baseBudget),
  };
}
function buildModel(rows:any[],variant:string,rules:any,card:any,reference:any=null){
  const squad=rules.squad||{};
  const formations=rules.formations||[];
  const maxPerClub=Number(rules.max_per_club||3);
  const bounds=xiBounds(formations);
  const constraints:any={
    total:{equal:Object.values(squad).reduce((s:any,v:any)=>s+Number(v||0),0)},
    xiTotal:{equal:11},
    capTotal:{equal:1},
  };
  if(Number.isFinite(rules.effectiveBudget))constraints.budget={max:Number(rules.effectiveBudget)};
  if(variant==="alternative"&&reference){
    constraints.aggressiveOverlap={min:AGGRESSIVE_MIN_OVERLAP,max:AGGRESSIVE_MAX_OVERLAP};
    constraints.aggressiveXfpFloor={min:n(reference.xfp)*AGGRESSIVE_XFP_FLOOR};
  }
  for(const pos of ["GK","DEF","MID","FWD"]){
    constraints["squad"+pos]={equal:Number(squad[pos]||0)};
    constraints["xi"+pos+"Min"]={min:bounds[pos].min};
    constraints["xi"+pos+"Max"]={max:bounds[pos].max};
  }
  for(const team of [...new Set(rows.map(r=>Number(r.team_id)).filter(Number.isFinite))]){
    constraints["team_"+team]={max:maxPerClub};
    constraints["defstack_"+team]={max:2};
  }

  const variables:any={},ints:any={};
  const scale=metricScale(rows);
  const referenceIds=new Set<number>(reference?.xi||[]);
  const captainExtra=Math.max(1,Number(card.captainMultiplier||2)-1);

  for(const r of rows){
    const id=Number(r.player_id),pos=String(r.position),team=Number(r.team_id);
    const price=n(r.price),xfp=n(r.xfp);
    constraints["one_"+id]={max:1};
    constraints["caplink_"+id]={max:0};
    const xiEligible=n(r.xi_probability)>=.5&&n(r.x_minutes)>=40;
    const lineupBase=variant==="recommended"?xfp:aggressiveScore(r,scale,false);
    const benchBase=variant==="recommended"?xfp:aggressiveScore(r,scale,false);
    const cheapBench=.0001*price;

    if(xiEligible){
      const v:any={
        score:lineupBase,
        total:1,xiTotal:1,["squad"+pos]:1,["team_"+team]:1,["one_"+id]:1,["caplink_"+id]:-1,
        ["xi"+pos+"Min"]:1,["xi"+pos+"Max"]:1,
      };
      if(Number.isFinite(rules.effectiveBudget))v.budget=price;
      if(pos==="GK"||pos==="DEF")v["defstack_"+team]=1;
      if(variant==="alternative"&&reference){
        if(referenceIds.has(id))v.aggressiveOverlap=1;
        v.aggressiveXfpFloor=xfp;
      }
      variables["x_"+id]=v;ints["x_"+id]=1;
      if(pos!=="GK"){
        const capMetric=variant==="recommended"?xfp:aggressiveScore(r,scale,true);
        variables["c_"+id]={score:capMetric*captainExtra,capTotal:1,["caplink_"+id]:1};
        ints["c_"+id]=1;
      }
    }

    const bench:any={
      score:card.benchBoost?benchBase:-cheapBench,
      total:1,["squad"+pos]:1,["team_"+team]:1,["one_"+id]:1,
    };
    if(Number.isFinite(rules.effectiveBudget))bench.budget=price;
    variables["b_"+id]=bench;ints["b_"+id]=1;
  }
  return {optimize:"score",opType:"max",constraints,variables,ints};
}
function solve(rows:any[],variant:string,rules:any,card:any,reference:any=null){
  const out:any=(solver as any).Solve(buildModel(rows,variant,rules,card,reference));
  if(!out?.feasible)throw new Error("Kart için geçerli kadro bulunamadı.");
  const xi:number[]=[],bench:number[]=[];let captain=0;
  for(const [key,value] of Object.entries(out)){
    if(n(value)<.5)continue;
    if(key.startsWith("x_"))xi.push(Number(key.slice(2)));
    else if(key.startsWith("b_"))bench.push(Number(key.slice(2)));
    else if(key.startsWith("c_"))captain=Number(key.slice(2));
  }
  if(xi.length!==11||bench.length!==4||!captain)throw new Error("Optimizer kadro yapısı geçersiz.");
  const byId=new Map(rows.map(r=>[Number(r.player_id),r]));
  const counts:any={DEF:0,MID:0,FWD:0};
  for(const id of xi){
    const row:any=byId.get(id);
    if(row?.position!=="GK")counts[row.position]=(counts[row.position]||0)+1;
  }
  const formation=`${counts.DEF}-${counts.MID}-${counts.FWD}`;
  if(!rules.formations.includes(formation))throw new Error("Geçersiz kart dizilişi.");
  return {xi,bench,captain,formation};
}
function shortlist(rows:any[]){
  const byPos:any={GK:[],DEF:[],MID:[],FWD:[]};
  for(const row of rows)byPos[row.position]?.push(row);
  const keep=new Set<number>();
  for(const pos of Object.keys(byPos)){
    const arr=byPos[pos];
    [...arr].sort((a,b)=>n(b.xfp)-n(a.xfp)).slice(0,40).forEach(x=>keep.add(Number(x.player_id)));
    [...arr].sort((a,b)=>n(b.p90)-n(a.p90)||n(b.xfp)-n(a.xfp)).slice(0,40).forEach(x=>keep.add(Number(x.player_id)));
    [...arr].sort((a,b)=>n(b.top25_score)-n(a.top25_score)||n(b.six_plus_probability)-n(a.six_plus_probability)).slice(0,35).forEach(x=>keep.add(Number(x.player_id)));
    [...arr].sort((a,b)=>n(a.price)-n(b.price)||n(b.xfp)-n(a.xfp)).slice(0,35).forEach(x=>keep.add(Number(x.player_id)));
  }
  return rows.filter(row=>keep.has(Number(row.player_id)));
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  try{
    const authHeader=req.headers.get("Authorization")||"";
    if(!authHeader.startsWith("Bearer "))return new Response(JSON.stringify({error:"Oturum gerekli."}),{status:401,headers:CORS});

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const token=authHeader.slice(7);
    const {data:{user},error:userError}=await userClient.auth.getUser(token);
    if(userError||!user)return new Response(JSON.stringify({error:"Oturum doğrulanamadı."}),{status:401,headers:CORS});

    const admin=createClient(url,service);
    const {data:subscription,error:subError}=await admin.from("scout_subscriptions")
      .select("plan,status,valid_until").eq("user_id",user.id).maybeSingle();
    if(subError)throw subError;
    const activePro=subscription?.plan==="pro"&&["active","trialing"].includes(subscription?.status)&&
      (!subscription?.valid_until||new Date(subscription.valid_until)>new Date());
    if(!activePro)return new Response(JSON.stringify({error:"Menajer kartları Gelişmiş üyeliğe özeldir."}),{status:403,headers:CORS});

    const body=await req.json().catch(()=>({}));
    const cardId=String(body.card||"");
    const variant=String(body.variant||"recommended").toLowerCase();
    const card=CARD_CONFIG[cardId];
    if(!card)return new Response(JSON.stringify({error:"Geçersiz menajer kartı."}),{status:400,headers:CORS});
    if(!["recommended","alternative"].includes(variant))return new Response(JSON.stringify({error:"Geçersiz kadro türü."}),{status:400,headers:CORS});

    const runRes=await admin.from("scout_model_runs")
      .select("id,gameweek,simulation_count").eq("is_current",true).eq("status","ready")
      .order("generated_at",{ascending:false}).limit(1).single();
    if(runRes.error)throw runRes.error;
    const RUN=runRes.data.id;

    const rulesRes=await admin.from("scout_game_rules").select("rules").order("season",{ascending:false}).limit(1).single();
    if(rulesRes.error)throw rulesRes.error;
    const rules=effectiveRules(rulesRes.data.rules,card);

    const {data,error}=await admin.from("scout_player_projections")
      .select("player_id,xfp,p90,six_plus_probability,top25_score,xi_probability,x_minutes,availability_probability,scout_players!inner(id,team_id,position,price,active,full_name,display_name,short_label,shirt_number)")
      .eq("run_id",RUN);
    if(error)throw error;

    const rows=(data||[]).map((x:any)=>({
      player_id:Number(x.player_id),xfp:n(x.xfp),p90:n(x.p90),six_plus_probability:n(x.six_plus_probability),
      top25_score:n(x.top25_score),xi_probability:n(x.xi_probability),x_minutes:n(x.x_minutes),
      availability_probability:n(x.availability_probability),
      team_id:Number(x.scout_players.team_id),position:String(x.scout_players.position),price:n(x.scout_players.price),
      active:Boolean(x.scout_players.active),player:x.scout_players,
    })).filter((x:any)=>x.active&&x.availability_probability>=.8&&x.price>0);

    const pool=shortlist(rows);
    let reference=null;
    if(variant==="alternative"){
      const baseline=solve(pool,"recommended",rules,card);
      const map=new Map(pool.map((row:any)=>[Number(row.player_id),row]));
      reference={xi:baseline.xi,xfp:baseline.xi.reduce((sum:number,id:number)=>sum+n(map.get(id)?.xfp),0)};
    }
    const solved=solve(pool,variant,rules,card,reference);
    const byId=new Map(pool.map((row:any)=>[Number(row.player_id),row]));

    const teamIds=[...new Set([...solved.xi,...solved.bench].map((id:number)=>Number(byId.get(id)?.team_id)).filter(Boolean))];
    const teamRes=teamIds.length?await admin.from("scout_teams").select("id,name").in("id",teamIds):{data:[],error:null};
    if(teamRes.error)throw teamRes.error;
    const teamMap=new Map((teamRes.data||[]).map((t:any)=>[Number(t.id),t.name]));

    const xiXfp=solved.xi.reduce((sum:number,id:number)=>sum+n(byId.get(id)?.xfp),0);
    const benchXfp=solved.bench.reduce((sum:number,id:number)=>sum+n(byId.get(id)?.xfp),0);
    const cap=n(byId.get(solved.captain)?.xfp);
    const captainBonus=cap*Math.max(1,Number(card.captainMultiplier||2)-1);
    const cardBase=card.benchBoost?xiXfp+benchXfp:xiXfp;
    const cardTotal=cardBase+captainBonus;
    const all=[...solved.xi,...solved.bench];
    const budget=all.reduce((sum:number,id:number)=>sum+n(byId.get(id)?.price),0);

    const members=all.map((id:number,index:number)=>{
      const row:any=byId.get(id);
      const isXi=index<solved.xi.length;
      return {
        player_id:id,
        squad_slot:isXi?"XI":"BENCH",
        sort_order:isXi?index+1:index-solved.xi.length+1,
        is_captain:id===solved.captain,
        xfp:n(row.xfp),
        xi_contribution:isXi?n(row.xfp)*(id===solved.captain?Number(card.captainMultiplier||2):1):(card.benchBoost?n(row.xfp):0),
        player:{
          id:Number(row.player.id),full_name:row.player.full_name,display_name:row.player.display_name,
          short_label:row.player.short_label,shirt_number:row.player.shirt_number,
          position:row.player.position,price:n(row.player.price),team_id:Number(row.player.team_id),
        },
        team:teamMap.get(Number(row.team_id))||"—",
      };
    });

    return new Response(JSON.stringify({
      run:{id:RUN,gameweek:runRes.data.gameweek},
      recommendation:{
        variant,budget,formation:solved.formation,xi_xfp:xiXfp,
        xi_xfp_with_card:cardTotal,captain_xfp:xiXfp+captainBonus,
        manager_card:cardId,
        budget_limit:Number.isFinite(rules.effectiveBudget)?Number(rules.effectiveBudget):null,
        unlimited_budget:Boolean(card.unlimited),
      },
      members,
    }),{headers:CORS});
  }catch(error:any){
    return new Response(JSON.stringify({error:String(error?.message||error)}),{status:500,headers:CORS});
  }
});
