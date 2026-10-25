# MH8 source-stat collection and verification — 25 October 2026

## Source and scope
Existing verified full-time FotMob matchDetails observations were retrieved again,
using the independently verified TFF fixture/score match mapping and explicitly
reconciled player IDs. [Read-only 9-match GitHub Actions audit](https://github.com/ecetin1998/tff-fantezi/actions/runs/40187773465)
finished successfully with **zero database writes during the source audit**.

- Season 2026–27, gameweek 8, **9/9** match identities/finished scores confirmed.
- **286/286 actually played players** matched against Scout identities; all 456
  active registered Fantasy players remain accounted for in the weekly Fantasy
  ledger (unused/nonparticipants are not asserted to have zero attacking stats).
- Fields observed explicitly in a player source record:

| Observation | Non-NULL sourced players | Other played players |
|---|---:|---|
| xG | 130/286 | **unknown**, not zero |
| xA | 192/286 | **unknown**, not zero |
| Shots | 130/286 | **unknown**, not zero |
| Shots on target | 130/286 | **unknown**, not zero |
| Key passes | 268/286 | **unknown**, not zero |

No positive-shot observation lacks xG in this source sample.
Three players have a positive observed key pass but no explicit xA value:
Arda Usluoğlu (Scout ID 437, match 317851), Adem Arous (ID 84,
match 317852) and Sinclair Armstrong (ID 314, match 317853).
**Neither their xA nor any other NULL field has been imputed.**

## Verified shots-on-target preservation
The existing `verified_gw8_attack` Edge importer parsed and validated
`shots_on_target`, but production table `scout_verified_weekly_attack`
did not have the column to persist it. Production now contains a
**nullable** `shots_on_target` with constraints for plausible counts and
`shots_on_target <= shots` when both are present; the idempotent schema SQL
is recorded in `supabase/migrations/20261025112000_mh8_verified_sot_nullable.sql`.

**130/130** player ID and shot-count source pairs were cross-checked against
the existing immutable source rows (no identity mismatch or contradictions).
The column now has **130 explicitly observed values**, including true
observed zeroes where FotMob provided 0. The other **156 remain NULL**.
The GitHub audit run job prints the exact verified ID/value pairs, original
source URLs, and coverage; this document intentionally does not copy a
provider's full bulk dataset into the public repo.

The old `scout_player_advanced_weekly` schema requires non-null integer
fields (default 0). We deliberately **did not** copy partial MH8 source
observations into that table, because doing so would silently convert
unknown shots, crosses, take-ons or shots on target into fabricated zeroes.
The canonical sparse MH8 record stays in `scout_verified_weekly_attack`.

## Protected production invariants
Read-only post-import checks confirmed:
- MH9 live run ID `656783bd-1fc7-4a5e-9284-4a3a1e263248` unchanged.
- Frozen MH9 backtest baseline ID `932bfe0d-2fbe-4c44-8e79-ee4c4766975d`, 456 player rows unchanged.
- Five saved squads, 75 squad members unchanged.
- No fantasy points, clean sheets, actuals, model predictions, user squads,
  50K simulations, optimizer, or model promotion performed as part of this
  source-only collection.

## Remaining evidence boundaries
The observed sparse playerStats fields do not independently prove that a
missing value is zero. xG/xA event-level completeness and team-vs-player
sums are not established by an absent provider key.
Do not import inferred player zeros or claim full 286 xG/xA coverage.
The role-aware recent-form change in
[Draft PR #365](https://github.com/ecetin1998/tff-fantezi/pull/365)
**must not be merged/promoted** until it beats the frozen model in a
leakage-safe forward evaluation. Missing data remains a true limitation
rather than a reason to inflate/penalize arbitrary Fantasy projections.
