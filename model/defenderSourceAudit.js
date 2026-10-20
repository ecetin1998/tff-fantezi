// Read-only source coherence audit for defender data.
// This module must NOT silently rewrite published xFP, official results,
// historical match snapshots, or observed xA fields.
const DEFENDER_ROLES=new Set(['CB','FB','WB']);
const n=value=>value===null||value===undefined||value===''?null:
  (Number.isFinite(Number(value))?Number(value):null);

function alignedMinutes(stats, closedWeeks=[]){
  const current=n(stats.through_gameweek);
  const source=n(stats.advanced_through_gameweek);
  const total=n(stats.minutes);
  if(current===null||source===null||total===null||source>current||source<1||total<=0)return null;
  if(source===current)return total;
  let postSource=0;
  for(let week=source+1;week<=current;week++){
    const rows=closedWeeks.filter(w=>Number(w.gameweek)===week);
    // Multiple fixtures / DGW are allowed, but all closed rows require
    // observed minutes. A missing or inferred-zero minute is NOT sourced 0.
    if(!rows.length||rows.some(w=>w.is_final!==true||n(w.minutes)===null))return null;
    postSource+=rows.reduce((sum,w)=>sum+Number(w.minutes),0);
  }
  const covered=total-postSource;
  return covered>0?covered:null;
}

function auditDefenderSource({player,stats,closedWeeks=[]}){
  const role=player?.primary_role||null;
  const result={player_id:Number(player?.id),role,flagged:[],aligned_minutes:null,
    recorded_xa_per90:n(stats?.xa_per90),derived_xa_per90:null,
    shadow_xa_per90:null,shots:n(stats?.shots),shots_on_target:n(stats?.shots_on_target)};
  if(!DEFENDER_ROLES.has(role))return result;
  const coverage=alignedMinutes(stats,closedWeeks);
  result.aligned_minutes=coverage;
  const totalXa=n(stats?.xa_total),observed=n(stats?.xa_per90);
  const prior=n(stats?.xa_model_per90);
  if(coverage!==null&&coverage>=360&&totalXa!==null&&totalXa>=0&&observed!==null&&observed>=0){
    const derived=90*totalXa/coverage;
    result.derived_xa_per90=derived;
    if(observed>0.12&&observed-derived>=0.12&&observed>2.5*derived){
      result.flagged.push('XA_SOURCE_TIME_WINDOW_INCOHERENT');
      // Diagnostic counterfactual, NOT a replacement for verified observations.
      result.shadow_xa_per90=0.8*derived+0.2*(prior===null?derived:Math.max(0,prior));
    }
  }
  const shots=n(stats?.shots),sot=n(stats?.shots_on_target),xg=n(stats?.xg_total);
  if(shots!==null&&coverage!==null&&shots>=40&&shots/(coverage/90)>5&&
     xg!==null&&xg<=1.0){
    result.flagged.push('IMPLAUSIBLE_DEFENDER_SHOT_COUNT_RECHECK_SOURCE');
  }
  if(shots!==null&&sot!==null&&sot>shots)
    result.flagged.push('SOT_EXCEEDS_SHOTS');
  return result;
}

module.exports={alignedMinutes,auditDefenderSource};
