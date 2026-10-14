# Scout attack allocation

The site reads the current Supabase Scout run. These scripts describe the GW7 attack allocation correction; running them does **not** publish a run or change the site. A promotion through `scout_promote_run` is the separate publishing step after both QA gates pass.

`attackAllocation.js` tempers a single exceptional shot's influence on future goal allocation by position, while keeping recorded xG intact. Goal weights blend adjusted xG and historical goal rate (75/25); assist weights blend xA and realized assist rate (70/30). Defender single-shot attenuation is role-aware (CB/FB/WB) when a sourced sub-role exists; otherwise it falls back to the generic DEF cap. The model still uses each player's normal fantasy points for a goal or assist.

To reproduce a comparison, provide `prepared-input.json` with `players`, `matches`, `team_checks`, `temperature`, `assist_fraction`, `own_fraction`, and `playerMatches`. Each player must include `id`, `club`, `pos`, `rates`, `durations`, `duration_weights`, `avail`, `role`, `benchw`, and `valid_games`. Each player match must include `id`, `mins`, `shots`, `xg`. Then run:

```sh
node model/paired_delta.js prepared-input.json attack-delta.json 50000 426427
```

The report contains candidate minus baseline differences. Apply those differences to **the matching current Supabase run** only after checking input identity and draw settings; carry over its minutes, availability and XI probabilities. Recompute role goal/assist shares and dependent top 25 and squad suggestions; check `scout_run_qa` and `scout_data_integrity_qa` on a staged run before promoting it. Every future GW refresh must supply updated match shots and xG, apply this allocation policy, and pass the same QA gates. This repository contains the comparison and optimizer. A gated refresh automation is designed in `docs/model-refresh-design.md`, but no schedule is installed until that design is explicitly approved.

`optimize_candidate.py` accepts a reviewed JSON array of players and writes recommended and alternative legal squad IDs. It does not write to Supabase.


## Simulator invariants

The current simulator derives club IDs from the fixture input, uses a seeded Mulberry32 generator, and stores score distributions in integer histograms instead of one value per player/draw.

Own-goal handling follows observed game scoring: the own-goal scorer is not treated as an attacking scorer, but a separately credited assist can still receive +3. The MH5 closure used by this project contains such a credited assist.

A simultaneous yellow+red flag is treated as a second-yellow dismissal and receives -3 total card points. If a future source distinguishes direct red from second-yellow red, split the event model before changing this rule.


## Enrichment features

The canonical enrichment contract is in `docs/enrichment-data-contract.md`. Current-season observed xA is kept separate from `xa_model_per90`; the latter is guaranteed through player-prior → position-prior fallback. Historical replay rows may use `effective_xa_per90` and `sub_role` only when those values were snapshotted before the replayed matchweek. Team left/center/right, shot-zone and situation profiles come from `scout_match_attack_events`; missing event data stays missing rather than being imputed as observed.


## Opposing GK/DEF clean sheets and bonus calibration

The simulation **already draws one fixture score** and scores both defences against that same outcome. Both teams earn clean sheets together only on 0-0 (subject to player minutes), and a goal removes the conceding team's +4. Opposing defensive players can nevertheless each have meaningful positive **expected** xFP: those are marginal expectations over *different* game outcomes. Their sums are the correct expected XI total, not a claim that both will score their individual P90 on the same draw. Accordingly, **do not impose a fixed opposing-defender penalty on recommended XI xFP**: it would misstate the expected-value objective.

There was a separate real overstatement: the Monte Carlo bonus proxy ranked players by their **integer Fantasy base points**, which made many 0-0 defenders appear tied for first BPS and each collect +3. Equal Fantasy scores are **not** evidence of equal performance/BPS scores. Until sourced player-level BPS can be ingested, the model breaks base-score ties with an independent continuous seeded ranking proxy per match and awards 3/2/1 to the three highest. A genuine tie can still be represented if validated BPS rankings become available; we must not fabricate BPS from missing action data. Both the Node reference and production Edge simulator apply the same fallback, with regression checks for (a) two-sided clean sheets on 0-0, (b) losing a clean sheet when the opponent scores, and (c) conservative match-level bonus budgets. This adjusts model xFP and thus downstream optimized XI on the **next QA-approved full run**, without overriding actual scoring, P25/P90 or 6+ separately.

**QA before any live promotion:** test realistic low-scoring fixtures and compare defender xFP, xBonus, 6+ and position-wise prediction errors against the most recent closed MH replay. Preserve the existing 50K simulation and optimization gates; do not mutate an already-published MH8 run in place or trigger an unreviewed extra refresh. For risk-sensitive squad advice, develop fixture-level joint score/lineup draws and report XI P25/P75 and probabilities (rather than replacing expected points with an arbitrary conflict deduction).
