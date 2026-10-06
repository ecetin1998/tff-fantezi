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
assert.equal(creator.assist,0.70*0.18+0.30*0.05,'rates[3] is xA and rates[2] is realized assists');

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
