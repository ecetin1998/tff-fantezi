# Model Refresh Automation

**Status:** installed and fail-closed.

## Schedule

The repository workflow `.github/workflows/model-refresh.yml` runs:
- every day at `06:00 UTC`;
- every six hours on Thursday and Friday;
- manually through `workflow_dispatch`.

Scheduled runs execute every pre-release stage but never promote automatically. Promotion is only present on a manual workflow run and is attached to the GitHub `production` environment.

## Pipeline

1. **Ingest / source freshness** — `model-refresh-control` optionally invokes `SCOUT_INGEST_URL` when configured, then requires availability, player stats, team stats, match history and weekly points to be no older than 24 hours. A stale source fails the workflow; timestamps are never forged.
2. **Candidate run** — selects the newest non-current `ready` run and requires it to be newer than the current production run.
3. **Candidate optimizer** — runs `run-staging-optimizer` for recommended and alternative variants.
4. **Model QA** — runs `scout_run_qa(candidate_run_id)` and records its gate.
5. **Data-integrity QA** — runs `scout_data_integrity_qa(candidate_run_id)`, plus availability freshness, and records its gate.
6. **Replay** — executes the 50K replay worker for the most recently completed gameweek and only records `backtest_pass` after the worker returns successfully.
7. **Promote** — on manual runs only, the `production` environment job calls `scout_promote_run(candidate_run_id)`. The database function re-checks all release gates before swapping the current run.

## Authentication

All protected workers use GitHub OIDC:
- issuer: `https://token.actions.githubusercontent.com`
- audience: `tff-fantezi-scout`
- repository: `ecetin1998/tff-fantezi`
- repository id: `1353738004`
- ref: `refs/heads/main`
- accepted events: `schedule`, `workflow_dispatch`

No Supabase service-role key is stored in GitHub.

## Failure behavior

Any stale source, missing candidate, optimizer failure, QA failure, integrity failure or replay failure stops the workflow and leaves the current run unchanged. Production promotion remains guarded by the database release gate and the GitHub environment.

## Upstream ingest

The control worker supports a protected `SCOUT_INGEST_URL` / `SCOUT_INGEST_TOKEN` hook. When no upstream ingester is configured it performs freshness validation only and fails closed if the source tables have not been refreshed in the last 24 hours. This prevents a scheduler from making stale data appear fresh.
