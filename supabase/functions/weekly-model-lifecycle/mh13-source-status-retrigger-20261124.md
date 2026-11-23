# MH13 signed lifecycle retrigger: correctly deployed MH12 independent closure source

- Supabase `weekly-model-lifecycle` function v73 now includes repository `closureSource.mjs` containing `MH12_INDEPENDENT_SOURCE`. Previously deployed v72 lacked MH12 in `acceptedFinalSource`, causing `finalized_player_coverage_pass=false` even with 456 final rows.
- Supabase `model-refresh-control` function v21 includes narrow MH12 source-verified advanced lag acceptance for 12 TFF-documented late substitutes, with no invented advanced xG/xA.
- MH12 `scout_week_closure_status(12).pass=true`, 456 owner-approved independent final rows, 9 Fantasy matches closed, backtest frozen pre-match marked closed, 18 team and 456 player season stat rows through MH12, 266 observed MH12 advanced source rows.
- MH13 9 official TFF fixtures have source IDs 317892-317900, all pre-kickoff.
- Automatically run existing signed workflow to produce 50,000 actual Monte Carlo draws/player; evaluate QA, 6+, xFP, optimizer, input freshness, leak-safe backtest, and promote only on complete success. Do not alter old MH12 frozen input or claim official TFF Fantasy score export.

This documentation-only push is deliberately within the existing workflow trigger path and leaves model code unmodified.
