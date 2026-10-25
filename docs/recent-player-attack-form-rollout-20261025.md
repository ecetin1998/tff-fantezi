# Recent player attack form — confidence-gated release, 2026-10-25

## Decision and source boundaries

The original draft PR #365 allowed **two gameweeks** of activity and a rate multiplier of up to +8%/-12%. The leakage-safe MH8 shadow audit found that overall conditional xG MAE worsened from **0.17087** to **0.17119** (RMSE 0.27555 to 0.27545); xA had **zero actively modified historical forecasts**. Therefore the original approach was **not approved for direct publication**.

This controlled successor replaces it without reverting or weakening the already-live three-week TEAM GF/GA opponent adjustment, 9-match/18-team/456-player gate, NB2 clean sheet probabilities or 50K expected-goal allocation checks.

## Conservative three-match player signal

* Source: final playing minutes from `scout_player_weekly_points`; explicit shots and key passes from `scout_verified_weekly_attack` or `scout_player_advanced_weekly` in this priority; partial missing observations are **UNKNOWN**, never fabricated zeros.
* **Three consecutive gameweeks immediately before the target week**, with each player appearing at least 45 minutes and total ≥180 minutes. All weekly minutes, provider observations and advanced source timestamps must precede the **target's earliest kickoff**, even during intraday refresh. If any week, baseline or timestamp is missing, the original forecast survives unchanged.
* Independent shot -> projected xG and key-pass -> projected xA changes, each based on time-weighted recent action rate divided by reliable seasonal source. Only xG/xA rate channels and derived goal/assist share priors change — **not** goals, assists, Fantasy actual points, clean sheets, match lambdas, available time, GK, penalties or score rules.
* One-match positive spikes are rejected unless production occurs in at least two of the three observations and no one match accounts for over 70% of weighted action volume.
* Coefficient 0.20 times shrunk log ratio, player rate bounded to **+4% / -6%** per channel. Stale season baselines or unaudited inferred left/right regional matchup effects do not produce pseudo-evidence.
* On intraday refresh always start with unchanged stable pre-kickoff player rates (never last intraday candidate). If weekly stable rate already carries `recent-attack-form-v2`, do not compound it.

## Test gate and forward evaluation

* Tests cover three-week requirement, missing data/no assumed zeros, one-hit spike rejection, independent xG/xA, GK guard, provider-priority, source pagination, no recursive refresh and all timestamp cutoffs. Regression tests require existing team form and NB2 lifecycle auditing to stay present.
* With only two timely historical source weeks before MH8, this three-week model returns the **original MH8 forecast unchanged**. This avoids repeating a previously observed negative MH8 signal. **This is not proof of future accuracy gains.** Prospective evaluations will compare future observed xG/xA and Fantasy MAE/RMSE, P(6+) Brier and top-25 accuracy against frozen, original snapshots.
* At release, first deploy the Edge Function with new source module, then merge main only after CI passes. A manual/scheduled lifecycle may construct a **new non-current 50K candidate**. It must pass NB2, allocation and full model QA *before* it can replace the current run. Do not edit MH9 frozen backtest or users' saved squads.
