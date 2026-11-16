// Read-only Highlightly Süper Lig coverage probe. No database writes and no guessed zeroes.
// Usage: HIGHLIGHTLY_API_KEY=... node scripts/highlightly-coverage-probe.mjs --date 2026-11-08
// Or:    HIGHLIGHTLY_API_KEY=... node scripts/highlightly-coverage-probe.mjs --match-id 123456
const base = "https://soccer.highlightly.net"
const key = process.env.HIGHLIGHTLY_API_KEY
const argv = process.argv.slice(2)
const arg = name => argv[argv.indexOf(name) + 1]
const date = argv.includes("--date") ? arg("--date") : null
const matchId = argv.includes("--match-id") ? arg("--match-id") : null
const maxMatches = argv.includes("--limit") ? Number(arg("--limit")) : 3

if (!key) {
  console.error("HIGHLIGHTLY_API_KEY gerekli. Anahtarı koda, loglara veya public ortama koymayın.")
  process.exit(2)
}
if (Boolean(date) === Boolean(matchId) ||
    (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
    (matchId && !/^\d+$/.test(matchId)) ||
    !Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 9) {
  console.error("Kullanım: --date YYYY-MM-DD [--limit 1..9] VEYA --match-id <provider-match-id>")
  process.exit(2)
}
let requests = 0
let quotaRemaining = null
async function get(path) {
  requests++
  const res = await fetch(base + path, {
    headers: {"x-rapidapi-key": key, accept: "application/json"},
    signal: AbortSignal.timeout(12000)
  })
  const remaining = res.headers.get("x-ratelimit-requests-remaining")
  if (remaining != null) quotaRemaining = Number(remaining)
  if (!res.ok) throw new Error(`Highlightly HTTP ${res.status} for ${path.split("?")[0]}`)
  return res.json()
}
const clean = name => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
function summarizeBox(body) {
  const teams = Array.isArray(body) ? body : []
  const totals = {playerRows: 0, minuteObserved: 0, xgObserved: 0, xaObserved: 0,
    shotsObserved: 0, keyPassesObserved: 0, savesObserved: 0}
  const byTeam = teams.map(({team, players}) => {
    const roster = Array.isArray(players) ? players : []
    for (const p of roster) {
      totals.playerRows++
      if (p.minutesPlayed !== null && p.minutesPlayed !== undefined) totals.minuteObserved++
      const stats = Array.isArray(p.statistics) ? p.statistics[0] : null
      if (!stats) continue
      for (const [field, key] of [
        ["expectedGoals", "xgObserved"], ["expectedAssists", "xaObserved"],
        ["shotsTotal", "shotsObserved"], ["passesKey", "keyPassesObserved"],
        ["goalsSaved", "savesObserved"]
      ]) if (stats[field] !== null && stats[field] !== undefined) totals[key]++
    }
    return {providerTeamId: team?.id ?? null, team: team?.name ?? null, playerRows: roster.length}
  })
  return {byTeam, totals}
}
async function probe(id, fixture=null) {
  try {
    const box = await get(`/box-score/${id}`)
    const teamStatistics = await get(`/statistics/${id}`)
    return {
      providerMatchId: id,
      fixture,
      boxScore: summarizeBox(box),
      teamStatisticsRows: Array.isArray(teamStatistics) ? teamStatistics.length : null,
      providerFieldsOptional: true
    }
  } catch (error) {
    return {providerMatchId: id, fixture, error: String(error.message)}
  }
}
let matches = []
if (matchId) {
  matches = [{id: Number(matchId)}]
} else {
  const result = await get(`/matches?date=${encodeURIComponent(date)}&countryCode=TR&limit=100`)
  const all = Array.isArray(result.data) ? result.data : []
  matches = all.filter(m => clean(m.league?.name).includes("super lig")).slice(0,maxMatches)
}
const results = []
for (const m of matches) {
  const fixture = m.homeTeam && m.awayTeam
    ? `${m.homeTeam.name} - ${m.awayTeam.name}` : null
  results.push(await probe(m.id, fixture))
  if (quotaRemaining === 0) break
}
console.log(JSON.stringify({
  source: "Highlightly", date, matchId, matchesFound: matches.length,
  requests, quotaRemaining, results,
  caution: "Read-only probe. Optional xG/xA absent != zero. Verify match/team/player IDs against official fixtures before ingesting. No output is official fantasy points."
},null,2))
if (!results.length || results.every(x=>x.error)) process.exitCode=1
