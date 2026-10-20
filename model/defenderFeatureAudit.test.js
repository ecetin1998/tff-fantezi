const assert=require('node:assert/strict');
const {defenderFeatureAudit}=require('./defenderFeatureAudit');

const malcom=defenderFeatureAudit({
  primary_role:'CB',xa_per90:.29,xa_total:.3,coverage_minutes:540,
  xa_model_per90:.06259934683968671,advanced_through_gameweek:7,
  xa_source:'fotmob_xa_per90_web_2026-09-28',shots:5,shots_on_target:2
});
assert.equal(malcom.status,'needs_source_review');
assert.deepEqual(malcom.flags,['XA_RATE_TOTAL_DISAGREEMENT']);
assert(Math.abs(malcom.xa_implied_per90-.05)<1e-12);
assert(Math.abs(malcom.candidate_xa_per90-.05251986936793734)<1e-8);
assert.equal(malcom.rate_and_total_same_snapshot_verified,false);

const mendes=defenderFeatureAudit({
  primary_role:'FB',xa_per90:.22,xa_total:.6,coverage_minutes:618,
  xa_model_per90:.062,advanced_through_gameweek:7,
  xa_source:'fotmob_xa_per90_web_2026-09-28',shots:10,shots_on_target:2
});
assert.equal(mendes.flags[0],'XA_RATE_TOTAL_DISAGREEMENT');
assert(mendes.candidate_xa_per90<.10&&mendes.candidate_xa_per90>.06);

const shots=defenderFeatureAudit({
  primary_role:'CB',shots:110,shots_on_target:108,
  xa_per90:.01,xa_total:null,advanced_through_gameweek:7
});
assert.deepEqual(shots.flags,['DEFENDER_SHOT_COUNT_OUTLIER']);
assert.equal(shots.candidate_xa_per90,null,
  'corrupt action count cannot be fabricated as an xA correction');

const ordinary=defenderFeatureAudit({
  primary_role:'WB',xa_per90:.15,xa_total:.8,coverage_minutes:550,
  xa_model_per90:.13,shots:8,shots_on_target:3,advanced_through_gameweek:7
});
assert.equal(ordinary.status,'ok');
assert.equal(ordinary.candidate_xa_per90,null);

for(const value of [null,undefined,'']){
  const missing=defenderFeatureAudit({
    primary_role:'CB',xa_per90:value,xa_total:.1,coverage_minutes:600
  });
  assert.equal(missing.candidate_xa_per90,null,'missing is never recorded zero');
}
assert.equal(defenderFeatureAudit({primary_role:'AM',xa_per90:.3,xa_total:0,coverage_minutes:600}).status,'not_applicable');
console.log('Defender xA/as-of and extreme shot source-review contracts PASS');
