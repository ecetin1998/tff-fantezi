// Pre-match snapshot of opponent shot-on-target volume. This must never query
// a changing live table from individual Monte Carlo chunks.
const valid=n=>n!==null&&n!==undefined&&n!==""&&Number.isFinite(Number(n));
export function freezeKeeperSot(rows,{gameweek,firstKickoff}={}){
  const gw=Number(gameweek),cutoff=Date.parse(firstKickoff||"");
  const teams={};
  if(!Number.isInteger(gw)||!Number.isFinite(cutoff))return {version:"gk-sot-source-age-decay-v3",weight:.15,teams};
  for(const row of rows||[]){
    const id=Number(row.team_id),week=Number(row.through_gameweek);
    const when=Date.parse(row.source_updated_at||"");
    const shots=Number(row.shots_on_target_per_match);
    if(!Number.isInteger(id)||id<1||!Number.isInteger(week)||
      week>=gw||week<gw-6||!Number.isFinite(when)||when>=cutoff||
      !valid(row.shots_on_target_per_match)||shots<1.5||shots>10||
      Number(row.matches_played)<5)continue;
    const key=String(id);
    if(!teams[key]||week>teams[key].through_gameweek)
      teams[key]={
        shots_on_target:shots,through_gameweek:week,source_updated_at:row.source_updated_at,
        // 4wk: legacy 15%; 5wk: 10%; 6wk: 5%; after that reject.
        // Shrinkage avoids abruptly discarding a 7-match observed opponent prior
        // while newer verified shots-on-target are still unavailable.
        weight:Math.max(0,.15-.05*Math.max(0,gw-week-4))
      };
  }
  return {version:"gk-sot-source-age-decay-v3",weight:.15,teams};
}
// Sample a single match's total shots on target, then subtract its *realized*
// conceded goals; goals and saves cannot both spend the same shot. The team's
// observed SOT prior receives only 15% weight and never invents extra goals.
export function keeperShotMean(lambda,per90Saves,exposure=1,sourcedSot=null,weight=.15){
  const goals=Math.max(0,Number(lambda)||0),rate=Math.max(.60,Math.min(.75,.66+.015*((Number(per90Saves)||0)-3)));
  const baseline=goals/Math.max(.12,1-rate);
  const validSot=typeof sourcedSot==="number"&&Number.isFinite(sourcedSot)&&sourcedSot>=1.5&&sourcedSot<=10;
  const w=validSot?Math.max(0,Math.min(.15,Number(weight)||0)):0;
  return Math.max(0,(baseline*(1-w)+(validSot?sourcedSot:baseline)*w)*Math.max(0,Number(exposure)||0));
}
