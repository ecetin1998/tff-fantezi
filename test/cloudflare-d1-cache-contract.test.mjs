import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const opennext=readFileSync(new URL('../open-next.config.ts',import.meta.url),'utf8');
const wrangler=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const deploy=readFileSync(new URL('../.github/workflows/cloudflare-deploy.yml',import.meta.url),'utf8');

test('OpenNext uses the documented D1 tag cache, not costly sharded DO tag-cache',()=>{
  assert.match(opennext,/tag-cache\/d1-next-tag-cache/);
  assert.match(opennext,/tagCache:\s*d1NextTagCache/);
  assert.doesNotMatch(opennext,/doShardedTagCache\s*\(/);
});
test('retain R2 incremental data cache and existing durable revalidation queue',()=>{
  assert.match(opennext,/incrementalCache:\s*r2IncrementalCache/);
  assert.match(opennext,/queue:\s*doQueue/);
  assert.match(opennext,/enableCacheInterception:\s*true/);
  assert.equal(wrangler.r2_buckets.find(x=>x.binding==='NEXT_INC_CACHE_R2_BUCKET')?.bucket_name,'tff-fantezi-isr-cache');
  assert.ok(wrangler.durable_objects?.bindings.some(x=>x.name==='NEXT_CACHE_DO_QUEUE'));
});
test('D1 binding points at the dedicated provisioned tag-cache database',()=>{
  assert.equal(wrangler.d1_databases.length,1);
  const d1=wrangler.d1_databases[0];
  assert.equal(d1.binding,'NEXT_TAG_CACHE_D1');
  assert.equal(d1.database_name,'tff-fantezi-next-tag-cache');
  assert.match(d1.database_id,/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
});
test('old DO tag binding retained for safe rollback but not used by OpenNext runtime',()=>{
  assert.ok(wrangler.durable_objects.bindings.some(x=>x.name==='NEXT_TAG_CACHE_DO_SHARDED'));
  assert.ok(wrangler.migrations.some(x=>x.new_sqlite_classes?.includes('DOShardedTagCache')));
  assert.doesNotMatch(opennext,/overrides\/tag-cache\/do-sharded-tag-cache/);
});
test('manual production release checks that D1 exists and tag cache schema is initialized',()=>{
  assert.match(deploy,/workflow_dispatch:/);
  assert.match(deploy,/Verify D1 tag-cache database/);
  assert.match(deploy,/Verify D1 tag revalidations table/);
});
