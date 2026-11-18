// Source-specific last-four-match FotMob xG/xA rates. The old season xG
// totals may be Sahadan/FotMob from an earlier window and MUST NOT be added
// to this separately observed window or divided by full-season minutes.
const valid=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x))&&Number(x)>=0
const clamp=(a,b,v)=>Math.max(a,Math.min(b,v))
export function blendRecentVerifiedAttackRates({xgPer90,xaPer90,window,targetWeek}={}){
  const rawXg=valid(xgPer90)?Number(xgPer90):null
  const rawXa=valid(xaPer90)?Number(xaPer90):null
  const unchanged={xgPer90:rawXg,xaPer90:rawXa,usedXg:false,usedXa:false,sourceWeightXg:0,sourceWeightXa:0,reason:"unverified_recent_window"}
  if(!window || Number(window.to_gameweek)!==Number(targetWeek)-1 ||
      Number(window.from_gameweek)!==Number(targetWeek)-4 ||
      String(window.source_name||"")!=="FotMob_MH8_11_verified_match_level_exposure")
    return unchanged
  const played=Number(window.played_games), minutes=Number(window.played_minutes)
  if(!Number.isFinite(played)||played<2||played>4||!Number.isFinite(minutes)||minutes<180)
    return unchanged
  const apply=(old,observed,sourceGames,sourceMinutes)=>{
    const games=Number(sourceGames), mins=Number(sourceMinutes)
    if(old===null||!valid(observed)||!Number.isInteger(games)||games<2||games>played||
      !Number.isFinite(mins)||mins<180||mins>minutes)return {value:old,applied:false,weight:0}
    const source=Number(observed)
    if(source>3)return {value:old,applied:false,weight:0} // bad outlier or incompatible units
    // 25–42% evidence weight, avoiding one-off finishing spikes and no-sample zeros.
    const w=clamp(.25,.42,.19+.045*games+.00008*mins)
    const blended=(1-w)*old+w*source
    return {value:Math.max(0,Math.min(3,blended)),applied:Math.abs(source-old)>.00001,weight:w}
  }
  const xg=apply(rawXg,window.xg_per90,window.xg_observed_games,window.xg_observed_minutes)
  const xa=apply(rawXa,window.xa_per90,window.xa_observed_games,window.xa_observed_minutes)
  return {xgPer90:xg.value,xaPer90:xa.value,usedXg:xg.applied,usedXa:xa.applied,
    sourceWeightXg:xg.weight,sourceWeightXa:xa.weight,
    reason:xg.weight||xa.weight?"fotmob_mh8_11_exposure_blended":"insufficient_sourced_minutes"}
}
