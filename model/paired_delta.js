// Compare attack allocation policies on the same prepared scout input and seed.
// This command only writes a JSON report; it never changes the current run.
const fs = require('node:fs');
const { simulateScout } = require('./simulateScout');

const [inputFile, outputFile, countArg = '50000', seedArg = '426427'] = process.argv.slice(2);
if (!inputFile || !outputFile) {
  console.error('Usage: node model/paired_delta.js prepared-input.json output.json [draws] [seed]');
  process.exit(2);
}
const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const count = Number(countArg);
const seed = Number(seedArg);
if (!Number.isInteger(count) || count < 1000 || !Number.isInteger(seed)) {
  throw Error('Draw count must be >= 1000 and seed must be an integer');
}
const previous = simulateScout(input, count, seed, false);
const candidate = simulateScout(input, count, seed, true);
const oldById = new Map(previous.map(p => [p.id, p]));
const metrics = ['xfp', 'core', 'bonus', 'xgoal', 'xassist', 'p25', 'p75', 'p90', 'p6', 'mc_se'];
const deltas = candidate.map(p => ({
  id: p.id,
  delta: Object.fromEntries(metrics.map(k => [k, p[k] - oldById.get(p.id)[k]])),
}));
fs.writeFileSync(outputFile, JSON.stringify({
  draws: count, seed, players: deltas,
  note: 'Apply only to a verified matching live run. Preserve live minutes, availability and starting probabilities. Rebuild dependent role shares, rankings and squads, run both QA gates, then promote.',
}) + '\n');
