const assert=require('node:assert/strict');
const {alignedMinutes,auditDefenderSource}=require('./defenderSourceAudit');

const closed=[{gameweek:8,minutes:90,is_final:true}];
const sample={through_gameweek:8,advanced_through_gameweek:7,minutes:630,
  xa_total:.3,xa_per90:.29,xa_model_per90:.0625993468,shots:5,shots_on_target:2,xg_total:1.46};

const bokele=auditDefenderSource({player:{id:291,primary_role:'CB'},stats:sample,closedWeeks:closed});
assert.equal(bokele.aligned_minutes,540);
assert(Math.abs(bokele.derived_xa_per90-.05)<1e-12);
assert(bokele.flagged.includes('XA_SOURCE_TIME_WINDOW_INCOHERENT'));
assert(Math.abs(bokele.shadow_xa_per90-(.8*.05+.2*.0625993468))<1e-12);
assert.equal(sample.xa_per90,.29,'diagnostic never overwrites sourced observed rates');

const mendes=auditDefenderSource({player:{id:472,primary_role:'FB'},stats:{
  ...sample,minutes:708,xa_total:.6,xa_per90:.22,shots:8,xg_total:.17,
},closedWeeks:closed});
assert.equal(mendes.aligned_minutes,618);
assert(mendes.flagged.includes('XA_SOURCE_TIME_WINDOW_INCOHERENT'));
assert(Math.abs(mendes.derived_xa_per90-(.6*90/618))<1e-12);

const fatih=auditDefenderSource({player:{id:84,primary_role:'CB'},stats:{
  ...sample,minutes:433,xa_total:.202,xa_per90:.07,shots:1,xg_total:.64,
},closedWeeks:closed});
assert(!fatih.flagged.includes('XA_SOURCE_TIME_WINDOW_INCOHERENT'),
  'do not penalize every CB or invent a blanket defender handicap');

const smolcic=auditDefenderSource({player:{id:239,primary_role:'CB'},stats:{
  ...sample,minutes:697,xa_total:null,xa_per90:.01,shots:110,
  shots_on_target:108,xg_total:.03
},closedWeeks:closed});
assert(smolcic.flagged.includes('IMPLAUSIBLE_DEFENDER_SHOT_COUNT_RECHECK_SOURCE'));
assert(!smolcic.flagged.includes('XA_SOURCE_TIME_WINDOW_INCOHERENT'));

assert.equal(alignedMinutes(sample,[]),null,'do not infer zero minutes for absent weeks');
assert.equal(alignedMinutes(sample,[{gameweek:8,minutes:null,is_final:true}]),null,
  'unknown minutes must never be coerced to zero');
assert.equal(alignedMinutes(sample,[{gameweek:8,minutes:90,is_final:false}]),null,
  'unclosed fixture minutes must not be used for total-rate reconciliation');
assert.equal(auditDefenderSource({player:{id:2,primary_role:'W'},stats:sample,closedWeeks:closed}).flagged.length,0,
  'outside positions are not subject to defender-specific audit');
assert.equal(auditDefenderSource({player:{id:292,primary_role:'CB'},stats:{
  ...sample,xa_total:null,xa_per90:.29
},closedWeeks:closed}).shadow_xa_per90,null,
  'missing observed xA total must remain unknown');
console.log('Defender provenance audit: xA cohorts, source-minute alignment, shots QA PASS');
