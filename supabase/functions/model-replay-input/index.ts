import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AUD="tff-fantezi-scout";
const ISS="https://token.actions.githubusercontent.com";
const REPO_ID="1353738004";
const REPO="ecetin1998/tff-fantezi";
const JWKS="https://token.actions.githubusercontent.com/.well-known/jwks";
const SOURCE="fresh-current-logic+cold-start-v1-2026-09-24";
const BASELINE="scoutplus-3.3-replay-v1-2026-09-26";

function part(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=");return JSON.parse(atob(p))}
function bytes(v:string){const p=v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"="),s=atob(p);return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function authorized(req:Request){
  const h=req.headers.get("authorization")||"";
  if(!h.startsWith("Bearer "))return false;
  try{
    const token=h.slice(7),parts=token.split(".");
    if(parts.length!==3)return false;
    const head=part(parts[0]),p=part(parts[1]),now=Math.floor(Date.now()/1000);
    const aud=Array.isArray(p.aud)?p.aud.includes(AUD):p.aud===AUD;
    const branchOk=p.ref==="refs/heads/fix/model-engine-v2"||p.ref==="refs/heads/main";
    const eventOk=["push","workflow_dispatch"].includes(String(p.event_name));
    if(head.alg!=="RS256"||!head.kid||p.iss!==ISS||!aud||!branchOk||!eventOk||p.repository_id!==REPO_ID||p.repository!==REPO||Number(p.exp||0)<now-30||Number(p.nbf||0)>now+30)return false;
    const jwks=await fetch(JWKS).then(r=>r.json()),jwk=(jwks.keys||[]).find((k:any)=>k.kid===head.kid);
    if(!jwk)return false;
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    return crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,bytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  }catch{return false}
}
function throwIf(q:any){if(q.error)throw q.error;return q.data}

Deno.serve(async(req:Request)=>{
  try{
    if(!(await authorized(req)))return Response.json({error:"unauthorized"},{status:401});
    const u=new URL(req.url),gw=Number(u.searchParams.get("gw"));
    if(!Number.isInteger(gw)||gw<1||gw>6)return Response.json({error:"gw must be 1..6"},{status:400});
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [metaQ,playersQ,matchesQ,actualQ,targetHistQ,priorHistQ,priorInputQ,baselineQ]=await Promise.all([
      sb.from("scout_replay_input_meta").select("*").eq("gameweek",gw).eq("benchmark_version",SOURCE).single(),
      sb.from("scout_replay_player_inputs").select("*").eq("gameweek",gw).eq("benchmark_version",SOURCE).order("player_id"),
      sb.from("scout_replay_match_inputs").select("*").eq("gameweek",gw).eq("benchmark_version",SOURCE).order("match_id"),
      sb.from("scout_player_weekly_points").select("player_id,points,minutes").eq("gameweek",gw).eq("is_final",true),
      sb.from("scout_match_history").select("gameweek,match_id,kickoff_at,home_team_id,away_team_id,home_goals,away_goals").eq("season","2026-27").eq("gameweek",gw),
      gw>1?sb.from("scout_match_history").select("gameweek,match_id,kickoff_at,home_team_id,away_team_id,home_goals,away_goals").eq("season","2026-27").lt("gameweek",gw).order("gameweek").order("match_id"):Promise.resolve({data:[],error:null}),
      gw>1?sb.from("scout_replay_match_inputs").select("gameweek,match_id,home_lambda,away_lambda").eq("benchmark_version",SOURCE).lt("gameweek",gw).order("gameweek").order("match_id"):Promise.resolve({data:[],error:null}),
      sb.from("scout_replay_weeks").select("*").eq("gameweek",gw).eq("benchmark_version",BASELINE).maybeSingle()
    ]);
    const meta=throwIf(metaQ),players=throwIf(playersQ)||[],matches=throwIf(matchesQ)||[],actualRows=throwIf(actualQ)||[];
    const targetHistory=throwIf(targetHistQ)||[],priorHistory=throwIf(priorHistQ)||[],priorInputs=throwIf(priorInputQ)||[],baseline=throwIf(baselineQ);
    if(!players.length||!matches.length)return Response.json({error:"replay input coverage missing",players:players.length,matches:matches.length},{status:409});

    const actualMap=new Map<number,{player_id:number,points:number,minutes:number}>();
    for(const r of actualRows){
      const id=Number(r.player_id),x=actualMap.get(id)||{player_id:id,points:0,minutes:0};
      x.points+=Number(r.points||0);x.minutes+=Number(r.minutes||0);actualMap.set(id,x);
    }
    const priorById=new Map<number,any>();
    for(const r of priorInputs)priorById.set(Number(r.match_id),r);
    const match_history=priorHistory.map((h:any)=>{
      const p=priorById.get(Number(h.match_id));
      return {...h,home_lambda:p?Number(p.home_lambda):null,away_lambda:p?Number(p.away_lambda):null};
    }).filter((x:any)=>x.home_goals!==null&&x.away_goals!==null&&x.home_lambda>0&&x.away_lambda>0);

    return Response.json({
      meta:{...meta,elo_blend:.15},
      players,
      matches,
      actuals:[...actualMap.values()],
      match_actuals:targetHistory,
      match_history,
      baseline_week:baseline,
      source_benchmark:SOURCE,
      baseline_benchmark:BASELINE
    });
  }catch(e:any){
    return Response.json({error:String(e?.message||e)},{status:500});
  }
});
