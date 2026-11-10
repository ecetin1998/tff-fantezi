// Prediction-only position quotas. A roster's old formation can be stale;
// never trust a single lineup, future source, partial XI, or a different club's
// player. Registered Fantasy positions (not tactical guesswork) are used.
const POSITIONS=["GK","DEF","MID","FWD"]
const stamp=value=>{const n=Date.parse(value||"");return Number.isFinite(n)?n:null}
const empty=()=>Object.fromEntries(POSITIONS.map(p=>[p,0]))
const same=(a,b)=>POSITIONS.every(p=>a[p]===b[p])
export function verifiedLineupFormations({
  targetWeek,cutoffAt,players=[],evidence=[],matches=[],baseFormations={}
}={}){
  const target=Number(targetWeek),cutoff=stamp(cutoffAt)
  const formations={...baseFormations},changed=[]
  const emptyResult={formations,changed_teams:[],policy:"two_complete_previous_verified_XIs",sample_count:0}
  if(!Number.isInteger(target)||target<3||cutoff===null)return emptyResult
  const teamByPlayer=new Map(players.map(p=>[Number(p.id),Number(p.team_id)]))
  const posByPlayer=new Map(players.map(p=>[Number(p.id),String(p.position)]))
  const matchesById=new Map()
  for(const m of matches){
    const gw=Number(m.gameweek),kickoff=stamp(m.kickoff_at)
    if((gw!==target-1&&gw!==target-2)||kickoff===null||kickoff>=cutoff||
       String(m.match_status)!=="Bitti")continue
    matchesById.set(Number(m.match_id),m)
  }
  const groups=new Map()
  for(const row of evidence){
    const gw=Number(row.gameweek),playerId=Number(row.player_id),
      matchId=Number(row.match_id),updated=stamp(row.updated_at),
      fixture=matchesById.get(matchId),teamId=teamByPlayer.get(playerId),
      position=posByPlayer.get(playerId)
    if((gw!==target-1&&gw!==target-2)||updated===null||updated>=cutoff||
       !fixture||Number(fixture.gameweek)!==gw||row.started!==true||
       row.verified_first_11!==true||typeof row.source_url!=="string"||
       !/^https:\/\//.test(row.source_url)||!POSITIONS.includes(position)||
       !teamId||![Number(fixture.home_team_id),Number(fixture.away_team_id)].includes(teamId))continue
    const key=teamId+":"+gw
    if(!groups.has(key))groups.set(key,{matchId,ids:new Set(),counts:empty(),duplicate:false})
    const g=groups.get(key)
    if(g.matchId!==matchId||g.ids.has(playerId)){g.duplicate=true;continue}
    g.ids.add(playerId);g.counts[position]++
  }
  for(const teamId of new Set(players.map(p=>Number(p.team_id)).filter(Number.isFinite))){
    const prev=groups.get(teamId+":"+(target-1)),older=groups.get(teamId+":"+(target-2))
    if(!prev||!older||prev.duplicate||older.duplicate)continue
    if(prev.ids.size!==11||older.ids.size!==11||
       prev.counts.GK!==1||older.counts.GK!==1||
       !same(prev.counts,older.counts))continue
    const newQuota=prev.counts
    const oldQuota=formations[String(teamId)]
    // Only source-supported 11-player registered-position counts can replace
    // the existing quota. Preserve established priors for incomplete data.
    if(!oldQuota||!same(newQuota,oldQuota)){
      formations[String(teamId)]={...newQuota}
      changed.push({team_id:teamId,from:oldQuota||null,to:{...newQuota},
        evidence_weeks:[target-2,target-1]})
    }
  }
  return {formations,changed_teams:changed,policy:"two_complete_previous_verified_XIs",sample_count:groups.size}
}
