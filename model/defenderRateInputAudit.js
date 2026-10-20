'use strict'

// Read-only advanced-stat source reconciliation for Fantasy defender roles.
// Never overwrites official data, historical backtest snapshots, or live xFP.
// A source mismatch is REVIEW evidence, not proof that either snapshot is false.
const DEFENDER_ROLES=new Set(['CB','FB','WB']);
const finite=value=>{
  if(value===null||value===undefined||value==='')return null;
  const v=Number(value);return Number.isFinite(v)?v:null;
};

function inspectDefenderAdvancedRow(row={}){
  const role=String(row.primary_role||row.sub_role||'').toUpperCase();
  if(!DEFENDER_ROLES.has(role))return {player_id:row.player_id??null,role,issues:[]};
  const issues=[],totalXa=finite(row.xa_total),rate=finite(row.xa_per90);
  const minutes=finite(row.season_minutes),lastWeekMinutes=finite(row.last_week_minutes);
  const seasonGW=finite(row.season_through_gameweek),advancedGW=finite(row.advanced_through_gameweek);

  // Week-aligned comparison is permitted only when advanced match actions are
  // exactly one gameweek behind season minutes and the intervening appearance
  // duration is source-backed. Never coerce NULL missing minutes to zero.
  const sameWeek=seasonGW!==null&&advancedGW!==null&&seasonGW===advancedGW;
  const behindOne=seasonGW!==null&&advancedGW!==null&&seasonGW===advancedGW+1&&
    lastWeekMinutes!==null&&lastWeekMinutes>=0;
  const coverageMinutes=minutes!==null?(sameWeek?minutes:behindOne?minutes-lastWeekMinutes:null):null;
  if(totalXa!==null&&rate!==null&&coverageMinutes!==null&&coverageMinutes>=360){
    const impliedXa90=90*totalXa/coverageMinutes;
    const diff=rate-impliedXa90;
    const ratio=rate/Math.max(impliedXa90,0.0001);
    if(rate>0.12&&diff>=0.12&&ratio>=2.5){
      const prior=finite(row.xa_model_per90);
      const preview=0.8*impliedXa90+0.2*(prior===null?impliedXa90:Math.max(0,prior));
      issues.push({kind:'XA_RATE_TOTAL_MISMATCH',severity:'review',reported_xa90:rate,
        implied_xa90:impliedXa90,coverage_minutes:coverageMinutes,ratio,
        preview_rate:preview,preview_only:true,
        why:'xA/90 and cumulative xA may come from differently dated samples'});
    }
  }
  const shots=finite(row.shots),onTarget=finite(row.shots_on_target),xg=finite(row.xg_total);
  const shotRate=minutes&&shots!==null?90*shots/minutes:null;
  if(shots!==null&&shots>35&&shotRate!==null&&shotRate>3.5){
    issues.push({kind:'DEFENDER_SHOT_COUNT_OUTLIER',severity:'review',shots,
      shots_on_target:onTarget,xg_total:xg,shots_per90:shotRate,
      why:'Check whether the source category is really shot attempts rather than other actions'});
  }
  if(shots!==null&&onTarget!==null&&onTarget>shots)
    issues.push({kind:'SOT_EXCEEDS_SHOTS',severity:'error',shots,shots_on_target:onTarget});
  return {player_id:row.player_id??null,role,issues};
}

function auditDefenders(rows){
  const list=rows.map(inspectDefenderAdvancedRow);
  const flagged=list.filter(x=>x.issues.length);
  const kinds={};
  for(const player of flagged)for(const issue of player.issues)
    kinds[issue.kind]=(kinds[issue.kind]||0)+1;
  return {players_checked:list.length,players_flagged:flagged.length,
    issues_by_kind:kinds,flagged,can_write_model:false,can_replace_source:false};
}
module.exports={inspectDefenderAdvancedRow,auditDefenders};
