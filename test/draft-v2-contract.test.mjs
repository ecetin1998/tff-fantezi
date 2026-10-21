import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync('supabase/migrations/20261021174500_draft_v2_archive_names_nomination.sql','utf8')
const ui=readFileSync('components/DraftRoom.js','utf8')
const archive=readFileSync('components/DraftArchives.js','utf8')

test('eight-character invitations use an unambiguous alphabet; old codes remain usable',()=>{
 assert.match(sql,/alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/)
 assert.match(sql,/for i in 1\.\.8 loop/)
 assert.match(ui,/\[8,12\]\.includes\(code\.length\)/)
})

test('members name their own team through atomic room locks',()=>{
 assert.match(sql,/scout_draft_join_named\(p_code text,p_team_name text\)/)
 assert.match(sql,/where invite_code=upper\(btrim\(p_code\)\) for update/)
 assert.match(sql,/where room_id=rm\.id and user_id is null/)
 assert.match(sql,/raise exception 'TEAM_NAME_TAKEN'/)
 assert.match(sql,/scout_draft_rename\(p_room_id uuid,p_team_name text\)/)
 assert.match(ui,/scout_draft_join_named/)
 assert.match(ui,/scout_draft_rename/)
})

test('completed draft snapshots freeze picks and prices and history is member-only',()=>{
 assert.match(sql,/create trigger scout_draft_capture_results_on_finish/)
 assert.match(sql,/new\.results_snapshot/)
 assert.match(sql,/'price',p\.price/)
 assert.match(sql,/scout_draft_my_rooms\(\)/)
 assert.match(sql,/t\.user_id=auth\.uid\(\)/)
 assert.match(archive,/Odalarım ve draft geçmişi/)
 assert.match(ui,/Sonuçları kopyala/)
})

test('auction V2 retains passed players and offers nomination and one-credit completion',()=>{
 assert.match(sql,/drop constraint if exists scout_draft_auction_lots_room_id_player_id_key/)
 assert.match(sql,/if rm\.rules_version=2 then/)
 assert.match(sql,/status='passed'/)
 assert.match(sql,/scout_draft_auction_nominate/)
 assert.match(sql,/scout_draft_auction_finish_bidding/)
 assert.match(sql,/scout_draft_auction_complete_pick/)
 assert.match(sql,/values\(rm\.id,t\.id,p_player_id,rm\.next_pick,1\)/)
 assert.match(sql,/select count\(\*\),coalesce\(sum\(price\),0\) into filled,spent/)
 assert.match(sql,/from public\.scout_draft_rooms where id=p_room_id for update/)
 assert.match(ui,/canNominate/)
 assert.match(ui,/canComplete/)
})

test('sorting matches public player analysis while Pro metrics remain private',()=>{
 for(const x of ["xfp","xi","minutes","points","value","price"])assert.match(ui,new RegExp('value="'+x+'"'))
 assert.match(ui,/proOverlayReady/)
 assert.match(ui,/\/api\/pro-player-overlay/)
 assert.match(ui,/\/api\/access/)
 assert.match(ui,/isPro&&proOverlayReady/)
 assert.doesNotMatch(sql,/['"]p90['"]\s*,pr\.p90/)
 assert.doesNotMatch(sql,/['"]six_plus_probability['"]\s*,pr\.six_plus_probability/)
})
