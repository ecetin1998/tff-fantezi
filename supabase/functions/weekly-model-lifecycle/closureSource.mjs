/**
 * Only 2026-27 MH8/MH9 and individually owner-approved MH10 may advance from explicit INDEPENDENT
 * calculated actuals. Never relabel calculated points as official TFF exports.
 *
 * This does not itself close games or mark rows final; caller must enforce
 * all full-week DB QA and data provenance checks first.
 */
export const MH8_INDEPENDENT_SOURCE = "independently_calculated_source_events";
export const MH10_INDEPENDENT_SOURCE = "mh10_owner_approved_independent_score_events";

export function acceptedFinalSource(gameweek, sourceKind) {
  if (sourceKind === "fresh_closed_actual") return true;
  return ([8, 9].includes(Number(gameweek)) && sourceKind === MH8_INDEPENDENT_SOURCE)
    || (Number(gameweek) === 10 && sourceKind === MH10_INDEPENDENT_SOURCE);
}

export function validFinalWeeklyPlayerRow(gameweek, row) {
  if (!row || row.is_final !== true || !acceptedFinalSource(gameweek, row.source_kind))
    return false;
  const minute = row.minutes;
  const points = row.points;
  const base = row.base_points;
  const bonus = row.bonus_points;
  if (row.player_id == null || row.match_id == null ||
      minute == null || points == null || base == null || bonus == null)
    return false;
  const mins = Number(minute), p=Number(points), b=Number(base), bonusNum=Number(bonus);
  if (!Number.isFinite(mins) || mins < 0 ||
      !Number.isInteger(p) || !Number.isInteger(b) || !Number.isInteger(bonusNum) ||
      bonusNum < 0 || bonusNum > 3 || p!==b+bonusNum)
    return false;
  // Inferred nonparticipants are zero-score candidates, never arbitrary points.
  if (mins === 0 && p !== 0 && [MH8_INDEPENDENT_SOURCE, MH10_INDEPENDENT_SOURCE].includes(row.source_kind))
    return false;
  return true;
}
