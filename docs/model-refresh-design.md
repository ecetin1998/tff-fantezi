# Model Refresh Automation Design

**Status:** design only. No schedule/cron is installed by this audit branch.

## Goal

Automate the weekly Scout lifecycle without ever promoting a run that has not passed the same release gates used manually.

## Proposed pipeline

1. **Acquire inputs**
   - fixtures and kickoff times
   - completed-match actuals
   - availability/suspension data
   - active roster and prices
2. **Build candidate**
   - create a new non-current `scout_model_runs` row
   - generate projections, roles, recommendations and dependent outputs
   - never mutate the current run in place
3. **Gate 1 — model QA**
   - execute `scout_run_qa(candidate_run_id)`
   - fail closed
4. **Gate 2 — data integrity**
   - execute `scout_data_integrity_qa(candidate_run_id)`
   - fail closed
5. **Replay / backtest**
   - run the exact model code/version that produced the candidate
   - record benchmark version, code revision, seed, draws and result
   - reject stale replay workers whose simulator does not match the candidate motor
6. **Release record**
   - write `scout_run_release_gates` only after all three gates pass
7. **Promote**
   - service-role-only `scout_promote_run(candidate_run_id)`
8. **Post-promotion verification**
   - verify exactly one current run
   - smoke-check public API and main pages
9. **Failure notification**
   - send a notification containing stage, run id, model revision and sanitized error
   - leave the previous current run untouched

## Recommended scheduler

Use **GitHub Actions schedule** for orchestration and Supabase Edge Functions only as protected workers.

Reasons:
- repository revision is explicit in every run;
- CI/model tests can run before remote compute;
- failed workflow is visible in the same place as code changes;
- secrets remain in GitHub/Supabase secret stores;
- promotion can be a final explicit job with dependencies on all gates.

Do not install the schedule until this design is approved.

## Proposed cadence

A single blind midnight refresh is not enough for fantasy decisions. After approval, use:
- daily input refresh during the gameweek;
- a stronger refresh after the previous MH is fully closed;
- a final pre-lock refresh sufficiently before first kickoff.

The exact clock times should be chosen only after confirming the official game lock behavior and source update latency.

## Required secrets

GitHub:
- `SUPABASE_FUNCTIONS_URL`
- `SCOUT_GATE_SECRET`

Supabase:
- `SCOUT_GATE_SECRET`

No service-role value is stored in repository files or exposed to frontend code.

## Idempotency

Every workflow run should carry a deterministic execution key such as season + target MH + source snapshot timestamp + git SHA. Re-running the same execution must reuse or safely replace the same candidate, never create multiple current runs.

## Notification design

On failure, notify only after a stage genuinely fails. Recommended options:
- GitHub Actions failure notification;
- Vercel/observability alert for post-deploy failures;
- later: a dedicated mail/Slack webhook stored as a secret.

No notification connector is hard-coded in this branch.

## Acceptance before enabling schedule

- protected Edge Functions reject missing/wrong `x-gate-secret`
- both QA RPCs are read-only
- replay runs the same simulator revision as candidate generation
- release gate is populated only after PASS
- promote is browser-inaccessible
- failure leaves current run unchanged
- one dry-run and one forced-failure test are documented
