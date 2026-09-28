const fs=require('node:fs')
const assert=require('node:assert/strict')

const edge=fs.readFileSync('supabase/functions/run-enrichment-replay-chunk/index.ts','utf8')
const migration=fs.readFileSync('supabase/migrations/20260928065823_enqueue_enrichment_replay_chunk.sql','utf8')

assert.match(edge,/scoutplus-3\.3-enrichment-replay-v2-2026-09-28/)
assert.match(edge,/gw must be 1\.\.6/)
assert.match(edge,/scout_replay_player_inputs/)
assert.match(edge,/merge_replay_sim_chunk/)
assert.match(edge,/Promise\.resolve\(\{data:\[\],error:null\}\)/)
assert.doesNotMatch(edge,/scout_player_single_shot_adjustments"\)\.select/)
assert.match(edge,/payload\.ref!==OPS_REF\|\|payload\.event_name!=="workflow_dispatch"/)
assert.match(edge,/x-run-token/)

assert.match(migration,/security definer/i)
assert.match(migration,/mh1_replay_worker_token/)
assert.match(migration,/revoke all on function public\.enqueue_enrichment_replay_chunk/i)
assert.match(migration,/grant execute .* service_role/is)
assert.match(migration,/benchmark','scoutplus-3\.3-enrichment-replay-v2-2026-09-28'/)

console.log('enrichment replay contract ok')
