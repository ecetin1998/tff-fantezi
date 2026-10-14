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

## Opposing defences: joint scenarios versus expected value

**MH8 source check (14 Oct 2026):** the Monte Carlo draws one score for each game and uses that score for both opponents. The clean-sheet contribution to a GK/DEF requires the opponent's score to be zero and the player's minutes to be at least 60. Both sides can score clean sheets only at 0-0; one side scoring removes the conceding side's clean sheet. However, the **expected** Fantasy points of two opposing defenders can both be high, because they average across *different scorelines*. Additive xFP remains the correct primary optimizer objective for maximizing *mean* XI points, not a promise of simultaneous clean-sheet success.

**Do not cap 3-2-1 bonus at six per match without source evidence.** Finalized MH7 match 317843 has one +3 and eight +2 players (19 bonus in all); MH7 totals 84 bonus over nine matches, and MH6 totals 81. The current bonus tie behavior reproduces this pattern. A proposed artificial six-point cap was **rejected** after checking these finalized rows; preserve actual ranked ties rather than importing rules from other competitions. The new regression test locks both the shared-score clean-sheet logic and source-backed many-way bonus ties.

**Kadro-risk follow-up:** The recommended XI optimizes mean xFP. A separate *risk-aware* explanation (e.g. probability both opposing GK/DEF clean sheets survive, XI P25/P75/P90 and floor over common 50K score draws) would be a valid optional view. It must be computed from jointly sampled XI outcomes, with fixture-specific minutes, substitutions and bonus, not by penalizing both defenders' marginal xFP or pretending independent P90 values occur simultaneously. Do not mutate the verified MH8 run solely for a cosmetic conflict penalty.


### MH7 first-place tie evidence and all-position opponent correlations (2026-10-14)

**Do not conflate consecutive tie groups with allocated player slots.** In the source-closed MH7 match `317840`, Mahmut Ertuğrul Taşkıran and Paulo Victor de Mileo Vidotti both recorded **7 base / +3 bonus**; six players at **6 base / +1 bonus**, not +2. The separately closed MH7 match `317842` likewise awarded **7 base / +3** to two first-place players and **6 base / +1** to the next tied group. Thus the verified examples are:
- `8,7,6 -> 3,2,1`
- `8,8,6 -> 3,3,1` (two joint winners occupy places 1 and 2)
- `8,8,8 -> 3,3,3` (no +2 or +1, all three slots occupied)
- `8,7,7 -> 3,2,2` (second-place players tie)
- `8,8,7,7 -> 3,3,1,1`

For any change to bonus awards, prioritize independently checked finalized player points and actual game behavior over an ambiguous prose interpretation. The current Edge and Node simulators use a shared score and score-based bonus ranking. They are tested for competing **FWD vs GK/DEF/MID** outcomes, not only CBs: opponent scoring removes DEF/GK clean-sheet +4, MID clean-sheet +1, and can create further GK/DEF goals-conceded penalties. Goal and assist allocations, bonus ranks, and 6+ distributions follow the same sampled fixture. These are coupled results within each simulation, even though displayed individual marginal xFP values remain additive expectations. No blanket opponent-specific xFP penalty is justified.
