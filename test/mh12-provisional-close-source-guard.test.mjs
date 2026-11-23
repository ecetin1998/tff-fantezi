import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedFinalSource, validFinalWeeklyPlayerRow, MH12_INDEPENDENT_SOURCE} from '../supabase/functions/weekly-model-lifecycle/closureSource.mjs';

const candidate = {
  player_id: 412,
  match_id: 34038,
  minutes: 19,
  base_points: 13,
  bonus_points: 3,
  points: 16,
  is_final: true,
  source_kind: 'mh12_highlightly_independent_provisional',
};

test('MH12 Highlightly independently calculated provisional points cannot masquerade as final actuals', () => {
  assert.equal(acceptedFinalSource(12, candidate.source_kind), false);
  assert.equal(validFinalWeeklyPlayerRow(12, candidate), false);
  assert.equal(acceptedFinalSource(12, 'mh11_owner_approved_independent_score_events'), false);
  assert.equal(acceptedFinalSource(12, 'independently_calculated_source_events'), false);
});

test('a truly verified final actual is still allowed through the explicit fresh-closed-actual source gate', () => {
  assert.equal(acceptedFinalSource(12, 'fresh_closed_actual'), true);
  assert.equal(validFinalWeeklyPlayerRow(12, {...candidate, source_kind: 'fresh_closed_actual'}), true);
  assert.equal(validFinalWeeklyPlayerRow(12, {...candidate, source_kind: 'fresh_closed_actual', is_final: false}), false);
  assert.equal(validFinalWeeklyPlayerRow(12, {...candidate, source_kind: 'fresh_closed_actual', points: 15}), false);
});

test('MH12 independent owner-approved source is scoped to one closed-week scoring method, not earlier/future weeks', () => {
  assert.equal(MH12_INDEPENDENT_SOURCE, 'mh12_owner_approved_independent_score_events');
  assert.equal(acceptedFinalSource(12, MH12_INDEPENDENT_SOURCE), true);
  assert.equal(acceptedFinalSource(11, MH12_INDEPENDENT_SOURCE), false);
  assert.equal(acceptedFinalSource(13, MH12_INDEPENDENT_SOURCE), false);
  const actual = {...candidate, source_kind: MH12_INDEPENDENT_SOURCE};
  assert.equal(validFinalWeeklyPlayerRow(12, actual), true);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, is_final: false}), false);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, base_points: 12}), false);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, minutes: null}), false);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, minutes: 0, points: 16}), false);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, minutes: 0, points: 0, base_points: 0, bonus_points: 0}), true);
  assert.equal(validFinalWeeklyPlayerRow(12, {...actual, source_kind: 'mh12_highlightly_independent_provisional'}), false);
});
