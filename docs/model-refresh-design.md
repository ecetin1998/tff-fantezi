# Model Refresh Automation Design

**Status:** implemented. The lifecycle checks sources and closure state hourly. It can rebuild the open MH before the lineup deadline, and it rolls to the next MH only after the current week is fully closed and all release gates pass.

## Goal

Keep the published Scout model fresh without ever replacing it with an unvalidated run.

## Active pipeline

1. **Acquire inputs**
   - fixtures and kickoff times
   - completed-match actuals
   - availability/suspension data
   - active roster and prices
2. **Build a non-current candidate**
   - open MH: rebuild only when critical source/config/code inputs changed and the first-match deadline has not passed
   - closed MH: build the next MH only when closure and next-fixture coverage are complete
   - never mutate the published current run in place
3. **50K simulation**
   - use the active, approved goal-distribution configuration
   - the current active configuration is gated NB2; Poisson remains the fail-closed fallback when no approved NB2 config exists
4. **Optimizer**
   - recommended XI maximizes expected value
   - ceiling XI uses the tail objective without being forced to differ from the recommended XI
   - squad legality, budget, club limit and defensive-stack constraints remain canonical
5. **Release gates**
   - `scout_run_qa(candidate_run_id)`
   - `scout_data_integrity_qa(candidate_run_id)`
   - bugfix invariants
   - leakage-safe model validation / approved component gate
6. **Freeze and promote**
   - snapshot the validated candidate
   - service-role-only `scout_promote_run(candidate_run_id)`
7. **Post-promotion verification**
   - verify exactly one current run
   - smoke-check public API and application routes

If any stage fails, the previous current run remains published.

## Cadence

The workflow runs an hourly lightweight check.

For an **open MH**, availability must be no older than 24 hours. A candidate refresh is considered when source data advances or when the code/config fingerprint changes. Refresh cadence tightens toward the lineup deadline:

- more than 48 hours remaining: at most daily
- 12–48 hours remaining: at most every 6 hours
- less than 12 hours remaining: at most every 2 hours
- from one hour before the first kickoff: locked

For a **closed MH**, rollover starts only when every current fixture is `Bitti` + `KAPANDI`, weekly actuals are final and the next MH fixtures are complete.

The scheduler does not fake freshness. If the approved upstream availability source is not configured or is stale, the current run remains published and the refresh is skipped with an explicit reason.

## Worker authentication

GitHub Actions workers use GitHub OIDC. The protected lifecycle workers accept only tokens matching:

- audience: `tff-fantezi-scout`
- repository: `ecetin1998/tff-fantezi`
- repository id: `1353738004`
- ref: `refs/heads/main`
- supported events: `schedule`, `workflow_dispatch`, and the path-filtered `push` lifecycle

The production lifecycle does not require a long-lived service-role value or model-operation secret in GitHub. Supabase service-role credentials stay inside Supabase workers.

## Reproducibility

Generated runs record:

- `source_cutoff`
- `input_snapshot_hash`
- `code_sha`
- `config_version`
- simulation count and benchmark version

The goal-distribution fingerprint includes the version, active alpha value and recorded component-gate benchmark. A configuration change is not inherited silently unless its component gate is recorded as passed.

## Idempotency

Current-MH refreshes and weekly rollovers use deterministic source-revision keys. Retrying the same source snapshot reuses the existing candidate instead of creating duplicate publishable runs.

## Source policy

The lifecycle can only refresh from approved inputs. The repository intentionally does not contain an unlicensed scraper for injury/suspension sources. Until an approved or licensed upstream endpoint is connected, the availability freshness guard remains fail-closed rather than updating timestamps without new evidence.

## Runtime guarantees

- current published data is never rewritten by an unfinished simulation
- 50K simulation completeness is checked before finalize
- browser roles cannot execute internal model/replay RPCs
- internal replay/model state is not browser-readable
- promotion is service-role only
- the previous current run survives any failed candidate
- first kickoff locks the current MH
