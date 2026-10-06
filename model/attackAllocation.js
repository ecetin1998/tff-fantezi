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
  const xgRate=Number(rates[0]||0),goalRate=Number(rates[1]||0);
  const assistRate=Number(rates[2]||0),xaRate=Number(rates[3]||0);
  const setPiecePrior=normalizedDefenderRole(player)==='CB'\n    ?Math.max(0,Number(player.team_set_piece_xg_per_match||0))*Math.max(0,Math.min(.35,Number(player.heading_box_share??.08)))\n    :0;\n  const adjustedXg=Math.max(xgRate*.45,xgRate-attenuation*excess/(2+exposure))+setPiecePrior;
  return {
    goal:Math.max(1e-6,.75*adjustedXg+.25*goalRate),
    assist:Math.max(1e-6,.70*xaRate+.30*assistRate),
    adjustedXg,
    singleShotExcess:excess,
    singleShotCap:cap,
    subRole:normalizedDefenderRole(player),\n    setPiecePrior,
  };
}

module.exports={attackWeights,singleShotCap,normalizedDefenderRole};
