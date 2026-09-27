# Audit Round 2 — Deploy Runbook

## Already complete before Vercel deploy

- Branch: `fix/audit-round-2`.
- GitHub quality CI must be green.
- Production Supabase migration `20260927100422 prepare_squad_rpc_v2` is already applied.
- Production Supabase migration `20260927101018 ensure_learning_summary_tr` is already applied.
- Five protected Edge Functions are deployed from `supabase/functions/` and accept GitHub OIDC only.
- MH7 recommendation refresh is live and QA/data-integrity PASS.
- Current live `main` compatibility grants remain intentionally open until the audited app is live.

## Vercel environment checklist

Production **and** Preview must contain:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SCOUT_DATA_API_KEY` with at least 24 characters

`SCOUT_OFFLINE_BUILD` must **not** exist in Vercel Production or Preview.

## Rate-limit-safe release strategy

Automatic Git deployments are restricted by `vercel.json` to `main` and `fix/audit-round-2`. All other branches are CI-only and must not consume Vercel builds.

Before the release push:

1. Run `npm run lint && npm test && npm run build && npm run test:runtime`.
2. With real Supabase public env values, start the production build locally and run:
   `SKIP_CDN_CHECK=1 BASE_URL=http://localhost:3000 bash scripts/smoke.sh`.
3. Do not push intermediate fix commits to `fix/audit-round-2`; batch them on a deploy-disabled branch and fast-forward the audit branch once.

If the Vercel limit is specifically the **remote build quota**, a local prebuild can reduce remote build consumption:

`vercel pull --yes --environment=production`
`vercel build --prod`
`vercel deploy --prebuilt --prod`

If the limit is on **deployment creation** rather than builds, `--prebuilt` does not bypass it.

## Production deployment order

1. Confirm the single batched Preview deploy succeeds and `BASE_URL=<preview> bash scripts/smoke.sh` passes.
2. Merge the audited branch into `main` once; do not drip-push individual commits.
3. Confirm Production deployment is READY and run `BASE_URL=https://tff-fantezi.vercel.app bash scripts/smoke.sh`.
4. Immediately apply, in order:
   1. `20260927101100_post_deploy_restrict_sensitive_public_columns.sql`
   2. `20260927101200_post_deploy_squad_write_lockdown.sql`
5. Run production smoke again, then post-deploy privilege and API verification below.

Do not apply the two post-deploy migrations before the new application build is live; the current old `main` build still relies on the compatibility grants/direct squad writes.

## Post-deploy verification

Database:
- anon cannot SELECT `notes`, `evidence`, `source_url` or `detail_source_*`.
- authenticated cannot directly INSERT/UPDATE/DELETE `scout_user_squads` or `scout_user_squad_members`.
- authenticated can execute `public.save_user_squad(jsonb)`; anon cannot.
- owner SELECT still works.
- `scout_run_qa` and `scout_data_integrity_qa` remain PASS.

HTTP:
- all public pages return successfully.
- `/players/99999` returns 404.
- `/api/scout-data?utm_source=x` canonicalizes with 308.
- public API contains no provenance/internal fields.
- `/api/scout-data?section=summary` is public, compact and below 50 KB.
- Pro waitlist first click and repeated click both succeed.
- squad save works through the RPC.
- password reset request completes without exposing provider errors.

## GitHub main protection — manual repo-admin step

Settings → Rules → Rulesets (or Branch protection) → protect `main`:

1. Require a pull request before merging.
2. Require at least 1 approval.
3. Require status checks before merging.
4. Add required check: `quality`.
5. Require branch to be up to date before merging if available.
6. Disable force pushes.
7. Disable branch deletion.
8. Do not allow direct pushes except an explicitly intended admin bypass.

## Old branches to delete after merge

- `qa-actions-build-20260926`
- `qa-auth-build-20260926`
- `qa-backtest-build-20260926`
- `qa-confirm-alt-20260926`
- `qa-confirm-build-20260926`
- `qa-confirm-full-alt-20260926`
- `qa-confirm-minimal-20260926`
- `audit-remediation-20260926`
- `model-gate-overdispersion`
