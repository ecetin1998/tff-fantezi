/**
 * For the 2026–27 season only, MH8/MH9 owner-approved independent match
 * event calculations may be finalized with explicit provenance. They are
 * NEVER TFF Fantasy official exports. All 456 players, 9 matches, event
 * adjudication and frozen backtest must be independently validated before
 * any caller sets is_final or closes a match.
 */
export const MH8_INDEPENDENT_SOURCE = "independently_calculated_source_events";

export function acceptedFinalSource(gameweek, sourceKind) {
  if (sourceKind === "fresh_closed_actual") return true;
  return [8, 9].includes(Number(gameweek)) && sourceKind === MH8_INDEPENDENT_SOURCE;
}

export function validFinalWeeklyPlayerRow(gameweek, row) {
  if (!row || row.is_final !== true || !acceptedFinalSource(gameweek, row.source_kind))
    return false;
  const minute = row.minutes, points = row.points, base = row.base_points, bonus = row.bonus_points;
  if (row.player_id == null || row.match_id == null ||
      minute == null || points == null || base == null || bonus == null)
    return false;
  const mins = Number(minute), p = Number(points), b = Number(base), bonusNum = Number(bonus);
  if (!Number.isFinite(mins) || mins < 0 ||
      !Number.isInteger(p) || !Number.isInteger(b) || !Number.isInteger(bonusNum) ||
      bonusNum < 0 || bonusNum > 3 || p !== b + bonusNum)
    return false;
  // Unplayed 0s are accepted only after documented exhaustive substitution QA.
  if (mins === 0 && p !== 0 && row.source_kind === MH8_INDEPENDENT_SOURCE)
    return false;
  return true;
}
