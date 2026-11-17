import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../scripts/highlightly-mh12-night-sprint.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/highlightly-sync/index.ts',import.meta.url),'utf8');

test('Temporary MH12 sprint starts after 03:00 TR reset without altering normal cron',()=>{
 assert.match(sql,/'5,35 0-3 \* \* \*'/);
 assert.match(sql,/fantezi-highlightly-mh12-night-sprint/);
 assert.match(sql,/fantezi-highlightly-supplementary-sync/);
 assert.match(sql,/Europe\/Istanbul/);
 assert.match(sql,/2026-11-22/);
 assert.match(sql,/cron\.unschedule/);
 assert.match(sql,/vault\.decrypted_secrets/);
 assert.match(sql,/timeout_milliseconds=>140000/);
 assert.doesNotMatch(sql,/HIGHLIGHTLY_API_KEY\s*=/);
});

test('Existing ingestion preserves daily budget and provider reserve plus exclusive lock',()=>{
 assert.match(edge,/daily_budget/);
 assert.match(edge,/remaining/);
 assert.match(edge,/lease_/);
 assert.match(edge,/toProcess/);
 assert.match(sql,/https:\/\/nnoagjayvrwyjtizhnfz\.supabase\.co\/functions\/v1\/highlightly-sync/);
});
