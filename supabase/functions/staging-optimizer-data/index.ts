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

const RUN="1f3f7a9d-6897-409b-a5b6-2fb89992e914";
Deno.serve(async(req:Request)=>{
  const u=new URL(req.url);
  if (!(await gateAuthorized(req))) return Response.json({error:"unauthorized"},{status:401});const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data,error}=await sb.from("scout_player_projections")
    .select("player_id,xfp,p90,x_minutes,availability_probability,confidence,scout_players!inner(team_id,position,price,active)")
    .eq("run_id",RUN);
  if(error)return Response.json({error:error.message},{status:500});
  return Response.json((data||[]).map((x:any)=>({
    player_id:Number(x.player_id),xfp:Number(x.xfp)||0,p90:Number(x.p90)||0,x_minutes:Number(x.x_minutes)||0,
    availability:Number(x.availability_probability)||0,team_id:Number(x.scout_players.team_id),
    position:String(x.scout_players.position),price:Number(x.scout_players.price)||0,
    active:Boolean(x.scout_players.active),confidence:String(x.confidence||"medium")
  })));
});