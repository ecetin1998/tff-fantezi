// Match-specific observed tactical roles; never changes a player's registered
// Fantasy position. Use only explicit verified lineup position labels.
export const ROLE_SET=new Set(['GK','CB','FB','WB','DM','CM','AM','WM','W','SS','ST']);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:Number(v)
export function currentTacticalRole({baseRole,baseSide,evidence=[],targetWeek}={}){
  const fallback={role:baseRole||null,side:baseSide||null,changed:false,
    trustedMatches:0,reason:'insufficient_verified_lineups'}
  const rows=(evidence||[]).filter(row=>
    row.verified===true&&row.started===true&&
    ROLE_SET.has(row.role)&&Number.isInteger(Number(row.gameweek))&&Number(row.gameweek)<targetWeek&&
    Number(row.gameweek)>=targetWeek-3&&Number.isFinite(number(row.minutes))&&number(row.minutes)>=45
  ).sort((a,b)=>Number(b.gameweek)-Number(a.gameweek)||Number(b.minutes)-Number(a.minutes));
  const unique=new Map();
  for(const row of rows)if(!unique.has(Number(row.gameweek)))unique.set(Number(row.gameweek),row);
  const recent=[...unique.values()].slice(0,3);
  if(recent.length<2)return {...fallback,trustedMatches:recent.length};
  const byRole=new Map();
  for(const row of recent){
    const key=String(row.role);
    if(!byRole.has(key))byRole.set(key,{count:0,minutes:0,rows:[]});
    const target=byRole.get(key);
    target.count++;target.minutes+=number(row.minutes);target.rows.push(row);
  }
  const ranked=[...byRole.entries()].sort((a,b)=>b[1].count-a[1].count||b[1].minutes-a[1].minutes);
  const winning=ranked[0];
  const [role,stats]=winning||[null,{count:0,rows:[]}];
  // Both recent verified starts must agree on a switch; an isolated one-off
  // positional move or a tie cannot override the scouting profile.
  if(stats.count<2||ranked.length>1&&ranked[1][1].count===stats.count)
    return {...fallback,trustedMatches:recent.length,reason:'mixed_recent_lineup_roles'};
  const sides=stats.rows.map(x=>x.side).filter(x=>x==='L'||x==='R'||x==='C');
  const side=sides.length>=2&&sides.every(x=>x===sides[0])?sides[0]:(baseSide||null);
  return {role,side,changed:role!==baseRole||side!==baseSide,trustedMatches:recent.length,
    reason:'multi_match_verified_lineup',evidenceWeeks:stats.rows.map(x=>x.gameweek)}
}
