import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  // D1 is the supported small-site backend. On 2026-10-22 the previous
  // sharded DO tag-cache generated >84k requests/day against Free's 100k cap.
  // Keep R2 incremental cache + DO revalidation queue unchanged.
  tagCache: d1NextTagCache,
  enableCacheInterception: true,
});
