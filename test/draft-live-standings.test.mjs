import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const sql=readFileSync('supabase/migrations/20261021193000_draft_live_verified_standings.sql','utf8')
const ui=readFileSync('components/DraftLiveStandings.js','utf8')
const room=readFileSync('components/DraftRoom.js','utf8')
const css=readFileSync('components/DraftLiveStandings.module.css','utf8')

test('standings are private to signed-in finished-room members',()=>{
 assert.match(sql,/if auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/)
 assert.match(sql,/where room_id=rm\.id and user_id=auth\.uid\(\)/)
 assert.match(sql,/rm\.status<>'finished'/)
 assert.match(sql,/revoke all on function public\.scout_draft_live_standings\(uuid,integer\) from public,anon/)
 assert.match(sql,/grant execute on function public\.scout_draft_live_standings\(uuid,integer\) to authenticated/)
})
test('use only final source points and closed fantasy match evidence, never expected xFP',()=>{
 assert.match(sql,/public\.scout_player_weekly_points/)
 assert.match(sql,/pts\.is_final is true and pts\.points is not null/)
 assert.match(sql,/match_record\.fantasy_closure='KAPANDI'/)
 assert.match(sql,/match_record\.match_status='Bitti'/)
 assert.match(sql,/pts\.match_id is null and wc\.all_closed is true/)
 assert.doesNotMatch(sql,/\bcore_xfp\b|\bscout_player_projections\b|\bscout_model_runs\s+pr\b/)
})
test('draft start week is preserved, snapshots and source scores do not mutate',()=>{
 assert.match(sql,/pts\.gameweek between rm\.gameweek and max_week/)
 assert.match(sql,/generate_series\(rm\.gameweek,max_week\)/)
 assert.match(sql,/'scoring_rule','all_15_players'/)
 assert.match(sql,/join public\.scout_draft_picks pk/)
 assert.doesNotMatch(sql,/\bupdate public\.scout_draft_picks\b|\binsert into public\.scout_player_weekly_points\b/)
})
test('standings UI highlights verified pending separately from legitimate zero points',()=>{
 assert.match(ui,/p\.points===null\|\|p\.points===undefined/)
 assert.match(ui,/statusLabel/)
 assert.match(ui,/30 sn güncelleme/)
 assert.match(ui,/Genel sıralama/)
 assert.match(ui,/Bu hafta/)
 assert.match(ui,/SEN/)
 assert.match(ui,/MH\{selected\}/)
 assert.match(ui,/scout_draft_live_standings/)
 assert.match(room,/room\.status==='finished'&&<DraftLiveStandings roomId=\{id\}\/>/)
 assert.match(css,/\.leaderboard/)
 assert.match(css,/\.players/)
})
