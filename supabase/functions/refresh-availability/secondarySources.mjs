// Cross-source availability verification; pure helpers for the existing
// GitHub-OIDC protected refresh-availability Edge Function.
// WmR is a supplementary feed; it never overrides a primary report on its own.
export const SECONDARY_URL = "https://wmrtips.com/tr/sakatlar/sueper-lig/";

const decode = value => String(value ?? "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const attribute = (html, name) =>
  html.match(new RegExp("\\b" + name + '="([^"]*)"', "i"))?.[1] ?? null;

export function normalizeAvailabilityName(value) {
  return String(value ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseWmrAvailability(html) {
  const rows = [];
  for (const match of String(html || "").matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const attrs = match[1];
    const category = attribute(attrs, "data-art");
    if (!["sperre", "verletzung"].includes(category)) continue; // ignore 'other/not eligible'
    const player = decode(attribute(attrs, "data-name"));
    const team = decode(attribute(attrs, "data-team"));
    const start = attribute(attrs, "data-seit");
    const until = attribute(attrs, "data-rueck");
    const reason = decode(match[2].match(/<td\b[^>]*class="[^"]*\bvz-grund\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
    if (!player || !team) continue;
    rows.push({
      player, team,
      kind: category === "sperre" ? "suspensions" : "injuries",
      reason,
      start: /^\d{4}-\d{2}-\d{2}$/.test(start ?? "") ? start : null,
      returnDate: /^\d{4}-\d{2}-\d{2}$/.test(until ?? "") ? until : null
    });
  }
  return rows;
}

// One club + a strong full/short name match; never infer a player solely from shirt numbers.
export function matchSupplementaryPlayer(row, players, teams, nameScore) {
  const club = teams.find(t =>
    normalizeAvailabilityName(t.name) === normalizeAvailabilityName(row.team) ||
    (row.team.toLowerCase() === "amedspor" && normalizeAvailabilityName(t.name) === "amed") ||
    (row.team.toLowerCase() === "gaziantep fk" && normalizeAvailabilityName(t.name) === "gaziantep"));
  if (!club) return {reason:"team_not_matched"};
  const options = players.filter(p => Number(p.team_id) === Number(club.id))
    .map(p => ({
      player:p,
      score:Math.max(...[p.full_name,p.display_name,p.short_label]
        .filter(Boolean).map(x => nameScore(row.player,x)))
    })).sort((a,b) => b.score-a.score);
  const best=options[0],second=options[1];
  if (!best || best.score<0.85 ||
      (second && best.score<0.95 && best.score-second.score<0.08))
    return {reason:"player_not_matched",teamId:Number(club.id)};
  return {playerId:Number(best.player.id),teamId:Number(club.id),score:best.score};
}

// The linked fixture must fall within the recorded suspension interval;
// a date on its own does not prove an enforceable card ban.
export function verifyWmrSuspension({
  row, kickoffAt, primaryKind, cumulativeYellow,
  lastWeekYellow, lastWeekRed, targetGameweek, evidenceGameweek
}) {
  if (row.kind !== "suspensions") return {verified:false,reason:"not_a_suspension"};
  const fixtureDate=String(kickoffAt||"").slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fixtureDate) ||
      !row.start || !row.returnDate ||
      row.start > fixtureDate || row.returnDate <= fixtureDate)
    return {verified:false,reason:"source_date_not_in_fixture"};
  if (primaryKind === "suspensions")
    return {verified:true,reason:"primary_and_secondary"};
  if (Number(targetGameweek) !== Number(evidenceGameweek)+1)
    return {verified:false,reason:"card_week_not_adjacent"};
  const reason=normalizeAvailabilityName(row.reason);
  const yellow=Number(cumulativeYellow);
  if (reason.includes("sari kart") && Number.isInteger(yellow) &&
      yellow>=4 && yellow%4===0 && Number(lastWeekYellow)>0)
    return {verified:true,reason:"source_plus_cumulative_and_last_match_yellow"};
  if (reason.includes("kirmizi kart") && Number(lastWeekRed)>0)
    return {verified:true,reason:"source_plus_last_match_red"};
  return {verified:false,reason:"independent_card_proof_missing"};
}
