/**
 * One-time explicit MH8 owner-approved source fallback for MH9 forecasting:
 * advanced xG/xA remain at MH7, while MH8 actual goals, minutes and base/bonus
 * Fantasy points are finalized with independent source provenance.
 * This never changes/forges advanced_through_gameweek.
 */
export function mh8CalculatedAdvancedLagAccepted({gameweek,activePlayers,stats,teamStats,matches,weekly}) {
  if(Number(gameweek)!==8 || !Array.isArray(activePlayers) || activePlayers.length!==456 ||
     !Array.isArray(stats) || stats.length!==456 ||
     !Array.isArray(teamStats) || teamStats.length!==18 ||
     !Array.isArray(matches) || matches.length!==9 ||
     !Array.isArray(weekly) || weekly.length!==456)return false;
  const ids=new Set(activePlayers.map(x=>Number(x.id)));
  if(ids.size!==456 || new Set(stats.map(x=>Number(x.player_id))).size!==456 ||
     new Set(teamStats.map(x=>Number(x.team_id))).size!==18 ||
     new Set(matches.map(x=>Number(x.match_id))).size!==9 ||
     new Set(weekly.map(x=>Number(x.player_id))).size!==456)return false;
  if(stats.some(s=>!ids.has(Number(s.player_id)) ||
       Number(s.through_gameweek)!==8 || Number(s.advanced_through_gameweek)!==7))
    return false;
  if(matches.some(x=>x.match_status!=="Bitti" || x.fantasy_closure!=="KAPANDI"))
    return false;
  if(weekly.some(w=>!ids.has(Number(w.player_id)) || w.is_final!==true ||
      w.source_kind!=="independently_calculated_source_events" ||
      w.minutes==null || !Number.isFinite(Number(w.minutes)) || Number(w.minutes)<0 ||
      !Number.isInteger(Number(w.points)) ||
      !Number.isInteger(Number(w.base_points)) ||
      !Number.isInteger(Number(w.bonus_points)) ||
      Number(w.points)!==Number(w.base_points)+Number(w.bonus_points) ||
      Number(w.bonus_points)<0 || Number(w.bonus_points)>3))return false;
  if(weekly.filter(w=>Number(w.minutes)>0).length!==286 ||
     weekly.filter(w=>Number(w.minutes)===0 && Number(w.points)===0).length!==170 ||
     weekly.reduce((sum,w)=>sum+Number(w.points),0)!==803 ||
     weekly.reduce((sum,w)=>sum+Number(w.bonus_points),0)!==113)return false;
  return true;
}
