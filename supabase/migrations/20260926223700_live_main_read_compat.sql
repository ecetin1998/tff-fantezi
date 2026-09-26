-- Temporary compatibility for the currently deployed pre-hardening main build.
-- The live build still issues SELECT * against these relations.
-- Keep only until the audit branch (which selects explicit public columns) is deployed.
grant select(notes)
  on public.scout_model_runs
  to anon, authenticated;

grant select(detail_source_label, detail_source_url, detail_source_updated_at)
  on public.scout_availability
  to anon, authenticated;

grant select(evidence, guardrail, notes)
  on public.scout_learning_log
  to anon, authenticated;
