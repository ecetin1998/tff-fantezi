import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Cloudflare Cache API fallback. R2 is not enabled on this account yet.
// Keep the config deployable now; switch to the R2/DO overrides once R2 is enabled.
export default defineCloudflareConfig({
  enableCacheInterception: true,
});
