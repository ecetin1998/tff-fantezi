import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync('supabase/migrations/20261021180000_draft_configurable_timers.sql','utf8')
const ui=readFileSync('components/DraftRoom.js','utf8')
const sheet=readFileSync('components/DraftRoom.module.css','utf8')

test('auction sliders and server checks constrain starting time to 10–20 and extension to 1–5 seconds',()=>{
 assert.match(ui,/type="range" min="10" max="20" step="1"/)
 assert.match(ui,/type="range" min="1" max="5" step="1"/)
 assert.match(sql,/auction_bid_seconds between 10 and 20/)
 assert.match(sql,/auction_extension_seconds between 1 and 5/)
 assert.match(sql,/clock_timestamp\(\)\+rm\.auction_bid_seconds\*interval '1 second'/)
 assert.match(sql,/rm\.auction_extension_seconds else 5 end\)\*interval '1 second'/)
})

test('classic draft has a 15–120 second selectable timer with server-side expiry',()=>{
 assert.match(ui,/type="range" min="15" max="120" step="15"/)
 assert.match(sql,/classic_pick_seconds between 15 and 120/)
 assert.match(sql,/create or replace function public\.scout_draft_classic_advance\(p_room_id uuid\)/)
 assert.match(sql,/clock_timestamp\(\)>=rm\.turn_started_at\+rm\.classic_pick_seconds\*interval '1 second'/)
 assert.match(sql,/raise exception 'TURN_EXPIRED'/)
 assert.match(sql,/turn_started_at=case when rm\.rules_version=2/)
 assert.match(ui,/scout_draft_classic_advance/)
 assert.match(ui,/classicSecondsLeft/)
})

test('automatic selection is atomic and respects remaining position slots and frozen xFP',()=>{
 assert.match(sql,/from public\.scout_draft_rooms where id=p_room_id for update/)
 assert.match(sql,/pr\.run_id=rm\.model_run_id/)
 assert.match(sql,/not exists \(select 1 from public\.scout_draft_picks p/)
 assert.match(sql,/case sp\.position when 'GK' then 2 when 'DEF' then 5 when 'MID' then 5 else 3 end/)
 assert.match(sql,/order by pr\.xfp desc,sp\.id limit 1/)
 assert.match(sql,/values\(rm\.id,team\.id,candidate,rm\.next_pick,true\)/)
 assert.match(sql,/if rm\.mode='snake' and mod\(turn_round,2\)=0/)
})

test('timer settings cannot change once drafting starts and existing rooms remain unaffected',()=>{
 assert.match(sql,/rm\.status<>'lobby' or rm\.rules_version<>2/)
 assert.match(sql,/rm\.rules_version=2 and rm\.draft_kind='classic'/)
 assert.match(sql,/case when rm\.rules_version=2 then rm\.auction_extension_seconds else 5 end/)
 assert.match(sql,/revoke all on function public\.scout_draft_classic_advance\(uuid\) from public,anon/)
 assert.match(sql,/grant execute on function public\.scout_draft_config_timers\(uuid,integer,integer,integer\) to authenticated/)
 assert.match(sheet,/\.timerSlider input\[type=range\]/)
})
