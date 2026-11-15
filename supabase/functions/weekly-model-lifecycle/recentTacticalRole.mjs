// Match-specific observed tactical roles; never changes a player's registered
// Fantasy position. Use only verified lineup slots, never a generic player profile.
export const ROLE_SET=new Set(['GK','CB','FB','WB','DM','CM','AM','WM','W','SS','ST']);
// Formation lines are not proof of tactical intent. Match the reviewed
// database policy when a geometry-only label is compatible with the prior.
function compatibleRole(row,baseRole){
  const label=String(row.source_position_label||'')
  if(label.startsWith('formation:4-1-4-1;line:3;')&&
     ((row.role==='CM'&&baseRole==='AM')||(row.role==='WM'&&baseRole==='W')))return baseRole
  if(label.startsWith('formation:')&&row.role==='CM'&&baseRole==='DM'&&
     !label.startsWith('formation:4-1-4-1;line:3;'))return baseRole
  if(/^formation:[345]-2-/.test(label)&&row.role==='DM'&&baseRole==='CM')return baseRole
  return row.role
}
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:Number(v)
// A source-confirmed formation slot cannot always distinguish duties.
// Never turn a compatible AM into a CM, or a winger into a wide midfielder,
// solely from the 4-1-4-1 provider's flat fourth line. Similarly a central
// midfield geometry cannot reliably distinguish a holding from a box-to-box
// player. A literal source role label, when available, takes precedence.
export function roleForVerifiedSlot(row,baseRole){
  const label=String(row.source_position_label||'');
  if(!label.startsWith('formation:'))return row.role;
  if(label.startsWith('formation:4-1-4-1;line:3;')){
    if(row.role==='CM'&&baseRole==='AM')return 'AM';
    if(row.role==='WM'&&baseRole==='W')return 'W';
  }
  if(row.role==='CM'&&baseRole==='DM'&&!label.startsWith('formation:4-1-4-1;line:3;'))return 'DM';
  if(row.role==='DM'&&baseRole==='CM'&&/^formation:[345]-2-/.test(label))return 'CM';
  return row.role;
}
export function currentTacticalRole({baseRole,baseSide,evidence=[],targetWeek,teamId=null,cutoffAt=null}={}){
  const fallback={role:baseRole||null,side:baseSide||null,changed:false,
    trustedMatches:0,reason:'insufficient_verified_lineups'}
  const cutoff=cutoffAt==null?null:Date.parse(cutoffAt);
  if(cutoffAt!=null&&!Number.isFinite(cutoff))return fallback;
  const rows=(evidence||[]).filter(row=>
    (teamId==null||Number(row.team_id)===Number(teamId))&&
    (cutoff===null||(Number.isFinite(Date.parse(row.observed_at))&&Date.parse(row.observed_at)<cutoff))&&
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
    const key=String(roleForVerifiedSlot(row,baseRole));
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
  const sides=stats.rows.map(x=>x.side).filter(x=>['L','R','C','BOTH'].includes(x));
  const uniqueSides=new Set(sides);
  const wide=['FB','WB','WM','W'].includes(role);
  const central=['GK','CB','DM','CM','AM','SS','ST'].includes(role);
  const side=sides.length>=2&&uniqueSides.size===1?sides[0]:
    wide&&(uniqueSides.has('BOTH')||uniqueSides.has('L')&&uniqueSides.has('R'))?'BOTH':
    central?'C':role===baseRole?(baseSide||null):null;
  return {role,side,changed:role!==baseRole||side!==baseSide,trustedMatches:recent.length,
    reason:'multi_match_verified_lineup',evidenceWeeks:stats.rows.map(x=>x.gameweek)}
}
