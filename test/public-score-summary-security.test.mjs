import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
test("public score view joins only curated RLS SELECT safe summary, not private projection",()=>{
 const sql=read("supabase/migrations/20261025193000_safe_public_simulation_score_summary.sql")
 const view=sql.slice(sql.lastIndexOf("create or replace view public.v_current_player_cards_public"))
 assert.match(view,/left join public\.scout_player_score_summary summary/)
 assert.doesNotMatch(view,/join public\.scout_player_projections/)
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/)
 assert.match(sql,/GRANT SELECT ON public\.scout_player_score_summary TO anon,authenticated/)
 assert.match(sql,/REVOKE ALL ON public\.scout_player_score_summary FROM PUBLIC,anon,authenticated/)
 assert.match(sql,/mode\.run_id|summary\.run_id/)
 assert.match(sql,/ON CONFLICT \(run_id,player_id\) DO UPDATE/)
 assert.match(sql,/mode_points,mode_probability/)
})
test("public curated view can resolve owner-only source, without exposing Pro columns",()=>{
 const sql=read("supabase/migrations/20261025193500_curated_public_score_view_permissions.sql")
 assert.match(sql,/security_invoker = false/)
 assert.match(sql,/has_table_privilege\('anon','public\.scout_player_projections','SELECT'\)/)
 assert.match(sql,/has_table_privilege\('anon','public\.v_current_player_cards','SELECT'\)/)
 assert.match(sql,/public whitelist includes Pro-only/)
})
