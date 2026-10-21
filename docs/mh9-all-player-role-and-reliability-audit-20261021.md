# MH9 all-player attack and tactical-role audit — 21 Oct 2026

## Scope and invariants

This candidate covers **all 456 active registered players**, all four Fantasy positions (GK, DEF, MID, FWD), and model sub-roles CB/FB/WB/DM/CM/AM/WM/W/SS/ST. The official Fantasy category and scoring must NEVER change because someone appeared further forward; the *predictive tactical sub-role* is a separate field. This audit does not rewrite frozen MH9 predictions, official/final MH1–MH8 points, xG observations, user squads, or posted official results.

## Live data source problems found

- 456 players with season statistics through MH8, but **456/456 advanced season source rows lag at MH7** (inconsistent time windows).
- 21 have >20 recorded season shots; 21 have zero shots despite positive cumulative xG. These are source-alignment discrepancies, not permission to invent zeroes.
- 152 missing xA totals; source absence is unknown, not confirmed 0.
- Recorded static scouting roles originate mostly from FotMob squad snapshots dated **28 Sept 2026**. A static role label can be outdated after a positional deployment change.
- Current MH8 source evidence (separate private table): 286 matched players, 130 xG, 192 xA, 130 shot observations and 268 key-pass observations. Sparse source observations remain NULL when absent.

## Candidate global forecast policy (no production promotion)

1. Keep player season evidence and official Fantasy scoring unchanged.
2. Only use shots/key passes to infer repeated threat when those totals have a verified **same-week denominator** as xG/xA and plausible bounds.
3. Regress exceptional, infrequent xG spikes towards role-specific empirical medians with more strength for defenders / tiny samples. CB uses an eight-match Bayesian equivalent. Other attacking roles have bounded, gentler adjustments (<=4% for regular sourced shot volume; up to 10% for 6+ match equivalents; up to 18% for shorter samples), **not a global points penalty**.
4. Keep xA separate from xG: a genuine chance creator need not be a shooter, and stale/unmatched key passes never become zero.
5. Preserve original model inputs for repeated in-week simulations so that source corrections and role priors cannot compound each cycle; legacy MH6 single-shot excess is NOT double-applied when the current candidate has the role-aware marker.
6. Model role can change from two independent verified recent starts that agree. One-off movement, absent labels, or ambiguous formation places retain former role pending evidence.
7. Source geometry is NOT an explicit provider text label. The FotMob GW7/GW8 sources contain consistent formation x/y slots and numeric position IDs. Only high-confidence flank/backline layout regions are assigned; central CM/DM/AM/ST positions are NOT automatically guessed.

## Verified match-by-match role evidence

GitHub Actions audits verified all **9 MH7** and all **9 MH8** full-time fixtures. MH7 audit matched 191 source starters to Scout records; MH8 198 source starters had full-time geometry and 286 played identities had independent reconciliation. A read-only crossweek audit found **66** distinct players whose last two verified lineups had the same, high-confidence role/side position (CB26, FB16, WB11, W13).

Read-only comparison with current static role/side showed **15 mismatches**:

| Player | Registered Fantasy category | Existing tactical | Two-week formation geometry |
|---|---|---|---|
| Deian Sorescu | DEF | RWB | RW |
| Gökhan Sazdağı | DEF | RB | RWB |
| Guram Giorbelidze | DEF | LB | LWB |
| Orhan Ovacıklı | DEF | RB | RWB |
| Richard Akonnor | DEF | LB | LWB |
| Simone Giordano | DEF | LB | LWB |
| Diogo Gonçalves | MID | CAM | LW |
| Doğuhan Şimşir | MID | CAM | LW |
| Brandon Baiye | MID | DM | RWB |
| Martín Rodríguez | MID | CAM | LWB |
| Konrad Michalak | MID | LW | RWB |
| Ermal Krasniqi | MID | LW | RB — needs review |
| Ayberk Karapo | DEF | RB | LB — side-only, needs review |
| Emre Kılınç | MID | RW | LW — side-only, needs review |
| Michał Karbownik | DEF | LB | RB — side-only, needs review |

**These are audited candidates, not independent proof that all fifteen positions are correct**. The counterintuitive switches need original team match reports/formation diagrams checked; geometry orientation or rotated positioning may disagree with simple left/right or role heuristics. Do not wholesale update player profiles from 2-week slot geometry alone.

A grounded example: Sorescu was FotMob right advanced role positionID **82**, geometry **x=.678, y=.875** for BOTH MH7 and MH8 in 4-1-4-1; confirmed 90 minutes both weeks. He is still a registered DEF and should keep DEF scoring; predictive role RW is a defensible next-step candidate.

In contrast Fatih Aksoy and Zak Jules are verified repeated CBs, Hadërgjonaj / Ruan / Arda Kurtulan wingbacks and Claudio Winck an FB. Those should not be relabeled due solely to goals/xG/xA.

## Limited history and correctness gates

MH7 and MH8 frozen backtests show average CB TOTAL fantasy points were underpredicted, so a global defender xFP reduction would be a methodological error. The model should correct only the specific attacking-scoring channel, leaving minutes/CS/other scores intact.

Candidate role/rate functions in PR #349 include unit tests, all-position rate regression, stale-source/null handling, Bayesian CB evidence, intraday no-double-counting, and verified two-match transition tests.

**Publishing remains gated**: The private role evidence table has been created with RLS and no public access, but no unverified tactical interpretations have been inserted; staging imports of source-inferred roles and **paired production-equivalent MH9 50K plus optimizer/QA** remain before promotion. The original MH9 frozen baseline, current live model and user squads remain unchanged until these gates pass.

### Sources

- GitHub Actions GW7 source audit: https://github.com/ecetin1998/tff-fantezi/actions/runs/39672580638
- GitHub Actions GW8 source audit: https://github.com/ecetin1998/tff-fantezi/actions/runs/39672580740
- Paired GW7/GW8 source audit: https://github.com/ecetin1998/tff-fantezi/actions/runs/39673976147
- PR #349: https://github.com/ecetin1998/tff-fantezi/pull/349
- Current full CI: https://github.com/ecetin1998/tff-fantezi/actions/runs/39673976274
