const assert = require('node:assert/strict');
const { attackWeights } = require('./attackAllocation');

const base = { id: 426, pos: 'DEF', rates: [0.14, 0, 0.06, 0.05] };
const single = [{ id: 426, mins: 90, shots: 1, xg: 0.57 }];
const varied = [{ id: 426, mins: 90, shots: 3, xg: 0.57 }];
const short = attackWeights(base, single);
const multi = attackWeights(base, varied);
assert(short.adjustedXg < multi.adjustedXg, 'isolated chance should carry less forecast influence');
assert.equal(multi.adjustedXg, base.rates[0], 'multi-shot threat remains intact');
assert.equal(single[0].xg, 0.57, 'the recorded event remains intact');
const creator = attackWeights({ ...base, id: 427, rates: [0.02, 0, 0.18, 0.05] }, []);
assert(creator.assist > short.assist, 'proven assist creator keeps a larger assist allocation');
console.log('Attack allocation checks passed');
