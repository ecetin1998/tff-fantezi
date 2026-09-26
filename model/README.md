# Scout attack allocation

The site reads the current Supabase Scout run. These scripts describe the GW7 attack allocation correction; running them does **not** publish a run or change the site. A promotion through `scout_promote_run` is the separate publishing step after both QA gates pass.

`attackAllocation.js` tempers a single exceptional shot's influence on future goal allocation by position, while keeping recorded xG intact. Goal weights blend adjusted xG and historical goal rate (75/25); assist weights blend creation and historical assist rates (50/50). The model still uses each player's normal fantasy points for a goal or assist. All players use the same rule.

To reproduce a comparison, provide `prepared-input.json` with `players`, `matches`, `team_checks`, `temperature`, `assist_fraction`, `own_fraction`, and `playerMatches`. Each player must include `id`, `club`, `pos`, `rates`, `durations`, `duration_weights`, `avail`, `role`, `benchw`, and `valid_games`. Each player match must include `id`, `mins`, `shots`, `xg`. Then run:

```sh
node model/paired_delta.js prepared-input.json attack-delta.json 50000 426427
```

The report contains candidate minus baseline differences. Apply those differences to **the matching current Supabase run** only after checking input identity and draw settings; carry over its minutes, availability and XI probabilities. Recompute role goal/assist shares and dependent top 25 and squad suggestions; check `scout_run_qa` and `scout_data_integrity_qa` on a staged run before promoting it. Every future GW refresh must supply updated match shots and xG, apply this allocation policy, and pass the same QA gates. This repository contains the comparison and optimizer but no scheduled GW refresh worker.

`optimize_candidate.py` accepts a reviewed JSON array of players and writes recommended and alternative legal squad IDs. It does not write to Supabase.
