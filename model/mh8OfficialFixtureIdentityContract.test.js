const assert=require('node:assert/strict');
const fs=require('node:fs');
const path='data/source-evidence/';
const identity=JSON.parse(fs.readFileSync(path+'gw8-scout-to-official-tff-match-identities-2026-10-20.json','utf8'));
const score=JSON.parse(fs.readFileSync(path+'gw8-tff-verified-match-results-2026-10-20.json','utf8'));
const events=JSON.parse(fs.readFileSync(path+'gw8-goal-penalty-event-staging-2026-10-20.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(path+'gw8-fotmob-match-page-candidates-2026-10-20.json','utf8'));
const roster=JSON.parse(fs.readFileSync(path+'gw8-scout-roster-identities-2026-10-20.json','utf8'));
const migration=fs.readFileSync('supabase/migrations/20261020153000_mh8_internal_to_tff_official_fixture_id_map.sql','utf8');
assert.equal(identity.matches.length,9);
assert.equal(new Set(identity.matches.map(x=>x.internal_match_id)).size,9);
assert.equal(new Set(identity.matches.map(x=>x.tff_match_id)).size,9);
const lookup=new Map(identity.matches.map(x=>[x.internal_match_id,x.tff_match_id]));
assert.equal(lookup.get(317852),317848,'Kasimpasa–Samsunspor MUST use TFF 317848');
assert.equal(lookup.get(317850),317851,'Genclerbirligi–Galatasaray MUST use TFF 317851');
assert.equal(lookup.get(317847),317852,'Corum–Rizespor MUST use TFF 317852');
for(const source of [score,events,manifest]){
 for(const m of source.matches){
  assert.equal(m.official_tff_match_id,lookup.get(m.match_id),
    'source manifest must distinguish TFF macID from internal match_id');
 }
}
for(const m of roster.fixtures)
 assert.equal(m.official_tff_match_id,lookup.get(m.match_id));
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.scout_match_external_ids/);
assert.match(migration,/PRIMARY KEY \(season, internal_match_id, source\)/);
assert.match(migration,/UNIQUE \(season, external_match_id, source\)/);
assert.match(migration,/ALTER TABLE public\.scout_match_external_ids ENABLE ROW LEVEL SECURITY/);
assert.match(migration,/REVOKE ALL ON public\.scout_match_external_ids FROM anon,authenticated/);
assert.match(migration,/Conflicting TFF ID mapping/);
assert.doesNotMatch(migration,/UPDATE public\.scout_match_history|UPDATE public\.scout_match_predictions|DELETE FROM|DROP TABLE|TRUNCATE/,
  'never rewrite historical model/backtest foreign keys as external TFF IDs');
console.log('MH8 nine official TFF IDs, historical internal fixture IDs and source mappings PASS');
