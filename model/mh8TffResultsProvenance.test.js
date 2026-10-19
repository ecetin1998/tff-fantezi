const assert=require('node:assert/strict');
const fs=require('node:fs');
const ev=JSON.parse(fs.readFileSync('data/source-evidence/gw8-tff-verified-match-results-2026-10-20.json','utf8'));
const sql=fs.readFileSync('supabase/migrations/20261020140000_source_verified_mh8_match_scores_pending_fantasy.sql','utf8');
assert.equal(ev.gameweek,8);
assert.equal(ev.matches.length,9);
assert.equal(new Set(ev.matches.map(m=>m.match_id)).size,9);
assert(ev.matches.every(m=>m.status==='Bitti'&&m.fantasy_closure!=='KAPANDI'));
assert.match(ev.source.url,/tff\.org/,'score source must be official TFF');
for(const m of ev.matches){
  const record='('+[m.match_id,
    {317847:8,317848:2,317849:5,317850:11,317851:6,317852:3,317853:4,317854:13,317855:1}[m.match_id],
    {317847:12,317848:16,317849:7,317850:17,317851:14,317852:15,317853:10,317854:18,317855:9}[m.match_id],
    m.home_goals,m.away_goals].join(',')+')';
  assert(sql.includes(record),'verified score must match guarded SQL: '+m.match_id);
}
assert.match(sql,/fantasy_closure='PUAN KONTROLÜ BEKLENİYOR'/);
assert.match(sql,/IF matching<>9 THEN RAISE EXCEPTION/);
assert.match(sql,/IF fixture_matching<>9 THEN RAISE EXCEPTION/);
assert.doesNotMatch(sql,/\bscout_player_weekly_points\b|\bis_final\b|fantasy_closure='KAPANDI'/,
  'Match-only ingest must not fabricate player actions or finalize the Fantasy week');
console.log('MH8 official scoreboard source, exact nine team pairs and no-fake-fantasy closure PASS');
