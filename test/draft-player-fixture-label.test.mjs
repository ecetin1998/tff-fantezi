import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const migration=readFileSync('supabase/migrations/20261022150000_draft_pool_fixture_home_away.sql','utf8')
const ui=readFileSync('components/DraftRoom.js','utf8')
const css=readFileSync('components/DraftRoom.module.css','utf8')

test('the draft player pool uses frozen room gameweek and actual fixture for both sides',()=>{
 assert.match(migration,/select model_run_id,gameweek into v_run,v_week/)
 assert.match(migration,/from public\.scout_match_history mh/)
 assert.match(migration,/mh\.gameweek=v_week/)
 assert.match(migration,/mh\.home_team_id=sp\.team_id or mh\.away_team_id=sp\.team_id/)
 assert.match(migration,/when mh\.home_team_id=sp\.team_id then mh\.away_team_name/)
 assert.match(migration,/when mh\.home_team_id=sp\.team_id then 'Ev'/)
 assert.match(migration,/else 'Dep'/)
 assert.match(migration,/'fixture_opponent',fixture\.opponent_name/)
 assert.match(migration,/'fixture_venue',fixture\.venue/)
 assert.match(migration,/where pr\.run_id=v_run and sp\.active=true and pr\.xfp is not null/)
})
test('pool read keeps member authorization and existing public-grade metrics',()=>{
 assert.match(migration,/auth\.uid\(\) is null then raise exception 'AUTH_REQUIRED'/)
 assert.match(migration,/where room_id=p_room_id and user_id=auth\.uid\(\)/)
 assert.match(migration,/ROOM_ACCESS_DENIED/)
 assert.match(migration,/'xfp',pr\.xfp/)
 assert.match(migration,/'x_minutes',pr\.x_minutes/)
 assert.match(migration,/'xi_probability',pr\.xi_probability/)
 assert.match(migration,/'opponent',pr\.opponent_name/)
 assert.match(migration,/revoke all on function public\.scout_draft_pool\(uuid\) from public,anon/)
 assert.match(migration,/grant execute on function public\.scout_draft_pool\(uuid\) to authenticated/)
})
test('pool and scout suggestions show club / position / opponent (venue) instead of role',()=>{
 assert.match(ui,/function Item\(\{p,sort='xfp'\}\)/)
 assert.match(ui,/p\.team\} · \{P\[p\.position\]\} · \{p\.fixture_opponent&&p\.fixture_venue/)
 assert.match(ui,/vs \$\{p\.fixture_opponent\} \(\$\{p\.fixture_venue\}\)/)
 assert.match(ui,/Fikstür bekleniyor/)
 assert.doesNotMatch(ui,/p\.role\|\|'—'/)
 assert.match(ui,/<Item p=\{p\} sort=\{activeSort\}\/>/)
 assert.match(ui,/<Item p=\{p\}\/>/)
 assert.match(css,/\.pText small\{[^}]*white-space:normal;overflow-wrap:anywhere/)
})
