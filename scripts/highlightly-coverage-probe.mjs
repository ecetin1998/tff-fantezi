// Highlightly Süper Lig free-plan coverage probe — read-only, never writes model data.
// Secret stays server-side: HIGHLIGHTLY_API_KEY=... node scripts/highlightly-coverage-probe.mjs --date 2026-11-08
// Or with a known provider match ID: ... --match-id 1348375393
// --limit N (1..9, default 3) bounds quota usage. One date query + 3 per match.
// 2026-27 Süper Lig Highlightly league ID: 173537 (verified 2026-11-16).
const BASE = "https://soccer.highlightly.net"
const LEAGUE_ID = 173537
const key = process.env.HIGHLIGHTLY_API_KEY
const argv = process.argv.slice(2)
const arg = name => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null
const date = arg("--date")
const matchId = arg("--match-id")
const limit = arg("--limit") === null ? 3 : Number(arg("--limit"))

if (!key || (Boolean(date) === Boolean(matchId)) ||
    (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
    (matchId && !/^\d+$/.test(matchId)) ||
    !Number.isInteger(limit) || limit < 1 || limit > 9) {
  console.error("HIGHLIGHTLY_API_KEY gerekli. --date YYYY-MM-DD [--limit 1..9] veya --match-id <id> verin.")
  process.exit(2)
}

let requests = 0
let remaining = null
async function request(path) {
  const r = await fetch(BASE + path, {
    headers: {"x-rapidapi-key": key, "accept": "application/json"},
    signal: AbortSignal.timeout(12000)
  })
  requests++
  const header = r.headers.get("x-ratelimit-requests-remaining")
  if (header != null) remaining = Number(header)
  if (!r.ok) throw new Error(`Highlightly HTTP ${r.status}: ${path.split("?")[0]}`)
  return r.json()
}
const nonnull = value => value !== null && value !== undefined
function boxCoverage(data) {
  const teamRows = Array.isArray(data) ? data : []
  const players = teamRows.flatMap(t => Array.isArray(t.players) ? t.players : [])
  const got = name => players.filter(p => nonnull(p.statistics?.[name])).length
  return {
    teams:teamRows.map(t => ({id:t.team?.id ?? null,name:t.team?.name ?? null,roster:t.players?.length ?? 0})),
    rosterRows:players.length,played:players.filter(p=>Number(p.minutesPlayed)>0).length,
    minutesObserved:players.filter(p=>nonnull(p.minutesPlayed)).length,
    starters:players.filter(p=>p.isSubstitute===false && Number(p.minutesPlayed)>0).length,
    fields:{
      xg:got("expectedGoals"),xa:got("expectedAssists"),
      shots:got("shotsTotal"),onTarget:got("shotsOnTarget"),
      keyPasses:got("passesKey"),saves:got("goalsSaved"),
      goals:got("goalsScored"),assists:got("assists"),yellow:got("cardsYellow"),red:got("cardsRed")
    },
    note:"Missing xG/xA is UNKNOWN, not zero. Some reserves with no attempts have null xG."
  }
}
function statsCoverage(data) {
  const teams = Array.isArray(data) ? data : []
  return teams.map(t=>{
    const rows = Array.isArray(t.statistics) ? t.statistics : []
    return {
      team:t.team?.name ?? null,metrics:rows.length,
      xg:rows.find(x=>x.displayName==="Expected Goals")?.value ?? null,
      xa:rows.find(x=>x.displayName==="Expected Assists")?.value ?? null,
      possession:rows.find(x=>x.displayName==="Possession")?.value ?? null,
      shotsOnTarget:rows.find(x=>x.displayName==="Shots on target")?.value ?? null
    }
  })
}
function lineupCoverage(body) {
  const count = team => (team?.initialLineup||[]).reduce((sum,row)=>sum+(Array.isArray(row)?row.length:0),0)
  return ["homeTeam","awayTeam"].map(k=>({
    team:body?.[k]?.name ?? null,formation:body?.[k]?.formation ?? null,
    starters:count(body?.[k])
  }))
}
const outputs = []
let matches
try {
  if (matchId) {
    matches = [{id:Number(matchId)}]
  } else {
    const res=await request(`/matches?date=${encodeURIComponent(date)}&leagueId=${LEAGUE_ID}&limit=100`)
    matches = (Array.isArray(res.data)?res.data:[]).slice(0,limit)
  }
  for (const m of matches) {
    const obj={matchId:m.id,fixture:m.homeTeam?.name && m.awayTeam?.name
      ? `${m.homeTeam.name} - ${m.awayTeam.name}` : null,
      gameweek:m.round??null};
    for (const [field,path,parser] of [
      ["boxScore",`/box-score/${m.id}`,boxCoverage],
      ["teamStatistics",`/statistics/${m.id}`,statsCoverage],
      ["lineups",`/lineups/${m.id}`,lineupCoverage]
    ]) {
      if (remaining===0) {obj.quotaExhausted=true;break}
      try {obj[field]=parser(await request(path))}
      catch(e){obj[field+"Error"]=e.message}
    }
    outputs.push(obj)
  }
  console.log(JSON.stringify({
    source:"Highlightly",leagueId:LEAGUE_ID,season:2026,date,queries:requests,
    remaining,results:outputs,noWrites:true,
    sourceCaveat:"Cross-check provider IDs, xG source differences and data rights before ingesting."
  },null,2))
  if (!outputs.length || outputs.every(x=>x.boxScoreError)) process.exitCode=1
}catch(e){console.error("Highlightly coverage test failed: "+e.message);process.exitCode=1}
