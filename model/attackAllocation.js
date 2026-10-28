// Forecast allocation only. Recorded match xG is never changed.
// rates[0] = xG/90, rates[1] = goals/90, rates[2] = assists/90,
// rates[3] = xA/90. Creation leans more on xA than realized assists.

function normalizedDefenderRole(player={}){
  const raw=String(
    player.sub_role ?? player.fotmob_position ?? player.position_detail ?? player.role_detail ?? ''
  ).trim().toUpperCase().replace(/[ _-]+/g,'');
  if(['CB','CENTREBACK','CENTERBACK','STOPER'].includes(raw))return 'CB';
  if(['WB','WINGBACK','LWB','RWB','KANATBEK'].includes(raw))return 'WB';
  if(['FB','FULLBACK','LB','RB','BEK'].includes(raw))return 'FB';
  return player.pos==='DEF'?'DEF':player.pos;
}

function singleShotCap(player={}){
  const role=normalizedDefenderRole(player);
  if(role==='CB')return .22;
  if(role==='FB')return .32;
  if(role==='WB')return .36;
  if(player.pos==='DEF')return .27;
  if(player.pos==='MID')return .33;
  return .42;
}

// Forecast-only: repeated observed opportunities, not a hot streak of goals
// and assists, determine how much DEF can claim of the team's goal events.
// The team match score/clean-sheet process and official scoring are unchanged.
const quality={
  CB:{shot:.095,keyPass:.055},
  FB:{shot:.090,keyPass:.070},
  WB:{shot:.090,keyPass:.075},
  DEF:{shot:.090,keyPass:.070},
}
const safe=(v)=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0
const norm=(r)=>["CB","FB","WB"].includes(String(r||"").toUpperCase())?String(r).toUpperCase():"DEF"

function credibleAttackWeights(position,role,rates=[],forecastXg=null){
  const xg=forecastXg===null?safe(rates[0]):safe(forecastXg)
  const goals=safe(rates[1]),assists=safe(rates[2]),xa=safe(rates[3])
  if(position!=="DEF")
    return {goal:Math.max(1e-6,.75*xg+.25*goals),
      assist:Math.max(1e-6,.70*xa+.30*assists),adjustedXg:xg,adjustedXa:xa}
  const prior=quality[norm(role)]
  // rates[12] and [13] are ONLY aligned season-to-date key passes and
  // shots per 90. -1 means unknown/stale; absence NEVER implies 0.
  const shots=Number(rates[13]),keys=Number(rates[12])
  const validShots=Number.isFinite(shots)&&shots>=0
  const validKeys=Number.isFinite(keys)&&keys>=0
  const adjustedXg=validShots
    ?Math.min(xg,Math.max(.50*xg,1.25*prior.shot*shots+.012)):xg
  const adjustedXa=validKeys
    ?Math.min(xa,Math.max(.55*xa,.90*prior.keyPass*keys+.020)):xa
  // Defender goals/assists are rare, noisy season samples. Weight actual
  // finishing only 10%; verified chance creation gets the remaining 90%.
  return {goal:Math.max(1e-6,.90*adjustedXg+.10*goals),
    assist:Math.max(1e-6,.90*adjustedXa+.10*assists),
    adjustedXg,adjustedXa,validShots,validKeys}
}

function attackWeights(player,matches=[]){
  const rates=player.rates||[];
  const observed=matches.filter(m=>Number(m.id)===Number(player.id)&&Number(m.mins)>0);
  const exposure=observed.reduce((sum,m)=>sum+Number(m.mins)/90,0);
  let excess=0;
  const cap=singleShotCap(player);
  for(const m of observed){
    const shots=Number(m.shots);
    const xg=Number(m.xg);
    if(!Number.isFinite(shots)||!Number.isFinite(xg)||shots!==1||xg<=0)continue;
    excess+=Math.max(0,xg-cap);
  }
  const attenuation=observed.length>=5?.55:.85;
  const xgRate=Number(rates[0]||0);
  const setPiecePrior=normalizedDefenderRole(player)==='CB'
    ?Math.max(0,Number(player.team_set_piece_xg_per_match||0))*Math.max(0,Math.min(.35,Number(player.heading_box_share ?? 0.08)))
    :0;
  // Source note marks xG already shrunk by the lifecycle; never double penalize.
  const rareChanceCalibrated=String(player.source_note||"").includes("role-aware-attack-v1");
  const adjustedXg=rareChanceCalibrated
    ?xgRate+setPiecePrior
    :Math.max(xgRate*.45,xgRate-attenuation*excess/(2+exposure))+setPiecePrior;
  const expected=credibleAttackWeights(player.pos,normalizedDefenderRole(player),rates,adjustedXg);
  return {
    goal:expected.goal,
    assist:expected.assist,
    adjustedXg:expected.adjustedXg,
    adjustedXa:expected.adjustedXa,
    singleShotExcess:excess,
    singleShotCap:cap,
    subRole:normalizedDefenderRole(player),
    setPiecePrior,
  };
}

module.exports={attackWeights,singleShotCap,normalizedDefenderRole,credibleAttackWeights};
