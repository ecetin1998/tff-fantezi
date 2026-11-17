import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../supabase/migrations/20261118012500_tff_served_ban_source_reason_sanitizer.sql",import.meta.url),"utf8");

test("TFF served-ban baseline clears stale provider reason but preserves confirmed availability",()=>{
 assert.match(s,/new\.availability_type='baseline'/);
 assert.match(s,/new\.detail_source_label='tff_official_suspension_served'/);
 assert.match(s,/new\.reason:=NULL/);
 assert.match(s,/new\.source_reason:=NULL/);
 assert.match(s,/new\.source_url:=new\.detail_source_url/);
 assert.match(s,/private\.canonical_availability_reason/);
 assert.match(s,/private\.parse_expected_return_date/);
 assert.match(s,/scout_availability_bulk_audit_log/);
 assert.match(s,/r\.is_current/);
 assert.match(s,/r\.gameweek=12/);
 assert.match(s,/a\.player_id=533/);
 assert.doesNotMatch(s,/UPDATE public\.scout_player_projections/i);
 assert.doesNotMatch(s,/UPDATE public\.scout_replay_player_inputs/i);
});
