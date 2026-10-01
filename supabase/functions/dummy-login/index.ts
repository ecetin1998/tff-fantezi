import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const USERS: Record<string,string> = {
  adminfree: "dummy.free.20261001@example.com",
  adminpro: "dummy.pro.20261001@example.com",
};
const EXPECTED_SHA256 = "d9443a2d016f81ac64bad8b55138333dfeab777f594f2bb7de1cc75f6e850f47";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { username?: string; password?: string } = {};
  try { body = await req.json(); } catch {}

  const username = String(body.username || "").trim().toLowerCase();
  const email = USERS[username];
  if (!email) return Response.json({ error: "invalid_credentials" }, { status: 401 });

  if (await sha256Hex(String(body.password || "")) !== EXPECTED_SHA256) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return Response.json({ error: "admin_env_missing" }, { status: 500 });

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) {
    return Response.json({ error: "link_generation_failed" }, { status: 500 });
  }

  return Response.json({ token_hash: data.properties.hashed_token, type: "magiclink" });
});
