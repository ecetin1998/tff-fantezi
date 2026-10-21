import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const sql=read('supabase/migrations/20261021162000_four_player_live_draft.sql')
const pool=read('supabase/migrations/20261021163000_four_player_draft_pool.sql')
const ui=read('components/DraftRoom.js')

test('draft uses exactly four seats and 60 selections',()=>{
 assert.match(sql,/array_length\(p_names,1\) is distinct from 4/i)
 assert.match(sql,/check \(team_index between 1 and 4\)/i)
 assert.match(sql,/check \(pick_number between 1 and 60\)/i)
 assert.match(sql,/when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3/i)
 assert.match(sql,/when v_room\.next_pick=60 then 'finished'/i)
})
test('snake alternates, linear retains direction',()=>{
 assert.match(sql,/v_room\.mode='snake' and mod\(v_round,2\)=0 then v_slot:=5-v_slot/i)
 assert.match(ui,/option value="snake"/)
 assert.match(ui,/option value="linear"/)
})
test('all sensitive room mutations are serialized and scoped to authenticated owners',()=>{
 const functions=['scout_draft_join','scout_draft_config','scout_draft_start','scout_draft_pick','scout_draft_undo']
 for(const name of functions) assert.match(sql,new RegExp('function public\\.'+name+'\\('))
 assert.equal((sql.match(/for update;/gi)||[]).length>=5,true)
 assert.match(sql,/not found or v_room\.host_user_id<>auth\.uid\(\) then raise exception 'HOST_ONLY'/i)
 assert.match(sql,/v_team\.user_id is distinct from auth\.uid\(\) then raise exception 'NOT_YOUR_TURN'/i)
 assert.match(sql,/unique \(room_id,player_id\)/i)
 assert.match(sql,/unique \(room_id,pick_number\)/i)
})
test('room tables are private, and the draft pool excludes P90 and Pro overlays',()=>{
 for(const table of ['scout_draft_rooms','scout_draft_teams','scout_draft_picks'])assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'))
 assert.match(sql,/revoke all on public\.scout_draft_rooms,public\.scout_draft_teams,public\.scout_draft_picks/i)
 assert.match(sql,/revoke all on function public\.scout_draft_state\(uuid\) from public,anon/i)
 assert.match(pool,/ROOM_ACCESS_DENIED/)
 assert.doesNotMatch(pool,/six_plus_probability|p90|p75|top25_score/i)
})
test('draft freezes the model run and never changes projections',()=>{
 assert.match(sql,/model_run_id uuid not null references public\.scout_model_runs/i)
 assert.match(pool,/where pr\.run_id=v_run/i)
 assert.doesNotMatch(sql,/update public\.scout_player_projections/i)
 assert.doesNotMatch(sql,/delete from public\.scout_player_projections/i)
})
