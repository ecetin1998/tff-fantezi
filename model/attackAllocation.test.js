const assert=require('node:assert/strict');
const {attackWeights,singleShotCap,normalizedDefenderRole}=require('./attackAllocation');

const base={id:426,pos:'DEF',rates:[0.14,0,0.06,0.05]};
const single=[{id:426,mins:90,shots:1,xg:0.57}];
const varied=[{id:426,mins:90,shots:3,xg:0.57}];
const short=attackWeights(base,single);
const multi=attackWeights(base,varied);
assert(short.adjustedXg<multi.adjustedXg,'isolated chance should carry less forecast influence');
assert.equal(multi.adjustedXg,base.rates[0],'multi-shot threat remains intact');
assert.equal(single[0].xg,0.57,'the recorded event remains intact');

const creator=attackWeights({...base,id:427,rates:[0.02,0,0.05,0.18]},[]);
assert(creator.assist>short.assist,'xA-led creator keeps a larger assist allocation');
assert.equal(creator.assist,0.90*0.18+0.10*0.05,'defender creation follows repeatable xA rather than noisy converted assists');

const cb={...base,sub_role:'CB'};
const fb={...base,sub_role:'RB'};
const wb={...base,sub_role:'RWB'};
assert.equal(normalizedDefenderRole(cb),'CB');
assert.equal(normalizedDefenderRole(fb),'FB');
assert.equal(normalizedDefenderRole(wb),'WB');
assert(singleShotCap(cb)<singleShotCap(fb)&&singleShotCap(fb)<singleShotCap(wb),'CB/FB/WB caps must reflect attacking role');
assert(attackWeights(wb,single).adjustedXg>attackWeights(cb,single).adjustedXg,'attacking wing-back retains more single-shot threat than a centre-back');

console.log('Attack allocation checks passed');

{
  const cb={id:77,pos:'DEF',sub_role:'CB',rates:[.08,.04,0,0],team_set_piece_xg_per_match:.42,heading_box_share:.16};
  const without=attackWeights({...cb,team_set_piece_xg_per_match:0},[]);
  const withPrior=attackWeights(cb,[]);
  assert.ok(withPrior.adjustedXg>without.adjustedXg,'CB set-piece prior should lift forecast xG');
  assert.ok(withPrior.setPiecePrior>0,'set-piece prior breakdown must be logged');
}

{
  const evidence=[{id:426,mins:90,shots:1,xg:.57}]
  const newCB={id:426,pos:'DEF',sub_role:'CB',rates:[.0668,0,0,.04],source_note:'weekly-auto • role-aware-attack-v1'}
  const result=attackWeights(newCB,evidence)
  assert.equal(result.adjustedXg,newCB.rates[0],
    'already-shrunk scoring input must not be penalized a second time')
  assert.ok(result.adjustedXg>0,'a rare scorer is still allowed to score')
}

{
  const inflated={id:48,pos:'DEF',sub_role:'WB',source_note:'role-aware-attack-v1',
    rates:[.0974,.1433,.2866,.1136,0,0,0,0,0,0,.4299,.14,.86]};
  const result=attackWeights(inflated,[]);
  const previousGoal=.75*.0974+.25*.1433,previousAssist=.70*.1136+.30*.2866;
  assert(result.goal<previousGoal*.72,'limited-shot defender goal allocation regresses meaningfully');
  assert(result.assist<previousAssist*.78,'two realised assists must not override six key passes');
  assert(result.forecastXg<.07,'one or two exceptional chance events are not a weekly expectation');
  const proven={id:427,pos:'DEF',sub_role:'WB',rates:[.003,0,.222,.192,0,0,0,0,0,0,0,0,2.56]};
  const creator=attackWeights(proven,[]);
  assert.equal(creator.forecastXa,.192,'frequent key-pass creators keep their sourced xA');
  const unknown={...inflated,rates:inflated.rates.slice(0,12)};
  assert.equal(attackWeights(unknown,[]).forecastXa,.1136,'missing key-pass coverage is UNKNOWN, not a zero');
  const striker={...inflated,pos:'FWD',sub_role:'ST'};
  const attack=attackWeights(striker,[]);
  assert.equal(attack.goal,.75*.0974+.25*.1433,'scorers retain their original conversion mix');
  assert.equal(attack.assist,.70*.1136+.30*.2866,'attackers retain validated creation policy');
}
