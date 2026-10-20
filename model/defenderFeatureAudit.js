/**
 * Non-mutating, source-evidence review for defenders.
 *
 * Historical xa_per90 snapshots can be older than xa_total / minutes and
 * therefore must NOT be silently replaced. Only produce a replay candidate
 * for review; never write season stats or a production projection here.
 */
function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const x=Number(value);
  return Number.isFinite(x)?x:null;
}
function defenderFeatureAudit(row={}){
  const role=String(row.primary_role||row.sub_role||'').toUpperCase();
  if(!['CB','FB','WB'].includes(role))return {status:'not_applicable',flags:[],candidate_xa_per90:null};
  const rate=finite(row.xa_per90),total=finite(row.xa_total);
  const prior=finite(row.xa_model_per90),mins=finite(row.coverage_minutes);
  const shots=finite(row.shots),sot=finite(row.shots_on_target);
  const flags=[];
  const asOfSource=String(row.xa_source||'');
  const sourceWeek=finite(row.advanced_through_gameweek);
  const fromSource=rate!==null&&total!==null&&mins!==null&&mins>=360&&rate>=0&&total>=0;
  let implied=null,candidate=null;
  if(fromSource){
    implied=total*90/mins;
    if(rate>=.12&&rate-implied>=.12&&rate>Math.max(.001,2.5*implied)){
      flags.push('XA_RATE_TOTAL_DISAGREEMENT');
      // Conservative *replay scenario only*: not a sourced corrected fact.
      candidate=.8*implied+.2*(prior===null?implied:Math.max(0,prior));
    }
  }
  if(shots!==null&&shots>35&&sourceWeek!==null&&sourceWeek<=8){
    flags.push('DEFENDER_SHOT_COUNT_OUTLIER');
    if(sot!==null&&sot>shots)flags.push('SHOTS_ON_TARGET_GT_SHOTS');
  }
  return {
    status:flags.length?'needs_source_review':'ok',
    flags,
    role,
    xa_per90:rate,
    xa_total:total,
    coverage_minutes:mins,
    xa_implied_per90:implied,
    candidate_xa_per90:candidate,
    xa_source:asOfSource,
    advanced_through_gameweek:sourceWeek,
    shots,shots_on_target:sot,
    // xa_total and xa_per90 can come from different reporting dates.
    // Treat this as a hypothesis until the exact source snapshot is checked.
    rate_and_total_same_snapshot_verified:false
  };
}
module.exports={defenderFeatureAudit};
