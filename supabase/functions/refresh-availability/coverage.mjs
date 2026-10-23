// A published injuries feed lists all squad players, including those NOT
// selectable in Fantasy. Off-roster entries must not cause a global 409.
// Unknown/inconsistent active-player matches remain a release gate.
const score = x => typeof x?.score==="number" && Number.isFinite(x.score)?x.score:0;

// One shared first name/surname is not credible evidence that a player
// switched teams. Match cross-team identity only on exact normalized full
// names or at least two distinct shared name tokens. Do NOT use short_label
// or single-token display_name to trigger a roster transfer lockout.
export function crossTeamIdentitySupported(sourceName,targetFullName){
  const tokens=value=>String(value||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/ı/g,"i")
    .replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
  const a=tokens(sourceName),b=tokens(targetFullName);
  if(!a.length||!b.length)return false;
  if(a.join(" ")===b.join(" "))return true;
  return new Set(a.filter(x=>b.includes(x))).size>=2;
}

export function assessAvailabilityCoverage({parsedCount,matchedCount,unmatched}={}){
  const ignored=[],critical=[];
  for(const row of unmatched||[]){
    const bestActive=score(row.best),bestInactive=score(row.inactive_best);
    const bestElsewhere=score(row.active_elsewhere_best);
    const teamId=Number(row.team_id);
    if(row.reason_unmatched!=="player" || !Number.isSafeInteger(teamId)){
      critical.push({...row,review_reason:"unresolved_team"});continue;
    }
    if(bestElsewhere>=.78){
      critical.push({...row,review_reason:"active_player_team_drift"});continue;
    }
    if(bestInactive>=.72){
      ignored.push({...row,review_reason:"inactive_fantasy_player"});continue;
    }
    if(bestActive<.5 && bestElsewhere<.5){
      ignored.push({...row,review_reason:"not_found_in_active_fantasy_roster"});continue;
    }
    critical.push({...row,review_reason:"possible_active_player_alias"});
  }
  const unknown=ignored.filter(x=>x.review_reason==="not_found_in_active_fantasy_roster").length;
  const coverage=parsedCount>0?matchedCount/parsedCount:0;
  return {
    accepted:matchedCount>=20 && coverage>=.75 && critical.length<=6 &&
      !critical.some(x=>x.review_reason==="active_player_team_drift") && unknown<=2,
    matched:matchedCount,parsed:parsedCount,coverage,ignored,critical,
    skippedInactive:ignored.filter(x=>x.review_reason==="inactive_fantasy_player").length,
    skippedUnlisted:unknown
  };
}
