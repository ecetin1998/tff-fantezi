const fs=require('node:fs')
const path=require('node:path')
const {spawnSync}=require('node:child_process')
const assert=require('node:assert/strict')

const root=path.resolve(__dirname,'..')
const canonical=JSON.parse(fs.readFileSync(path.join(root,'rules/tff-fantasy.json'),'utf8'))
const jsRules=require(path.join(root,'lib/rules.js'))
assert.deepEqual(JSON.parse(JSON.stringify(jsRules.TFF_FANTASY_RULES)),canonical)

const py=spawnSync('python3',['-c',
  "import json,sys;sys.path.insert(0,'model');import optimizer_rules;print(json.dumps(optimizer_rules.RULES,sort_keys=True))"
],{cwd:root,encoding:'utf8'})
assert.equal(py.status,0,py.stderr)
assert.deepEqual(JSON.parse(py.stdout),canonical)

const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260927145156_single_source_game_rules.sql'),'utf8')
const match=sql.match(/\$rules\$([\s\S]*?)\$rules\$::jsonb/)
assert.ok(match,'SQL rules seed not found')
assert.deepEqual(JSON.parse(match[1]),canonical)

const optimizerPy=fs.readFileSync(path.join(root,'model/optimizer_rules.py'),'utf8')
const optimizerTs=fs.readFileSync(path.join(root,'supabase/functions/run-staging-optimizer/index.ts'),'utf8')
assert.doesNotMatch(optimizerPy,/BUDGET_SPEND_REWARD|budget_spend_reward|bench_expected_value/)
assert.doesNotMatch(optimizerTs,/budgetPenaltyPerM|spendReward|benchValue|\.08\*playProbability/)
assert.match(optimizerPy,/CAPTAIN_LAMBDA=0\.18/)
assert.match(optimizerTs,/captainLambda=\.18/)
assert.match(optimizerPy,/\* 1e-4/)
assert.match(optimizerTs,/cheapBench=\.0001\*price/)

const autosubTs=fs.readFileSync(path.join(root,'supabase/functions/_shared/autosub.ts'),'utf8')
assert.match(optimizerPy,/def expected_autosub_value\(/)
assert.match(optimizerPy,/def optimize_bench_for_autosubs\(/)
assert.match(autosubTs,/export function expectedAutosubValue\(/)
assert.match(autosubTs,/export function optimizeBenchForAutosubs\(/)
assert.match(optimizerTs,/import \{ optimizeBenchForAutosubs \} from "\.\.\/_shared\/autosub\.ts"/)

assert.match(optimizerPy,/def _shortlist_bench_candidates\(/)
assert.match(autosubTs,/function shortlistBenchCandidates\(/)
assert.match(optimizerPy,/for _ in range\(4\):/)
assert.match(autosubTs,/iteration<4/)

const scoring=canonical.scoring
const sim=fs.readFileSync(path.join(root,'model/simulateScout.js'),'utf8')
assert.match(sim,/const \{SCORING\}=require\('\.\.\/lib\/rules\.js'\)/,'live simulator must read canonical scoring rules')

const enrichment=fs.readFileSync(path.join(root,'supabase/functions/run-enrichment-replay-chunk/index.ts'),'utf8')
const scoringMatch=enrichment.match(/const SCORING=({[\s\S]*?\n});/)
assert.ok(scoringMatch,'enrichment replay SCORING literal missing')
const replayScoring=Function('"use strict";return ('+scoringMatch[1]+')')()
assert.deepEqual(replayScoring,scoring,'enrichment replay scoring must match canonical rules exactly')

for(const file of [
  'supabase/functions/run-mh1-replay-chunk/index.ts',
  'supabase/functions/run-replay-distribution-test/index.ts'
]){
  const replay=fs.readFileSync(path.join(root,file),'utf8')
  assert.match(replay,/goalPts\s*=\s*\[10,6,5,4\]/,file+' goal scoring drifted')
  assert.match(replay,/csPts\s*=\s*\[4,4,1,0\]/,file+' clean-sheet scoring drifted')
  assert.match(replay,/\(mins\[i\]>0\?1:0\)\+\(mins\[i\]>60\?1:0\)/,file+' appearance scoring drifted')
  assert.match(replay,/cards\[i\]=rc\?-3:\(yc\?-1:0\)/,file+' card scoring drifted')
  assert.match(replay,/assists\[[^\n]+\]\+=3/,file+' assist scoring drifted')
  assert.match(replay,/ownc\[[^\n]+\]-=2/,file+' own-goal scoring drifted')
  assert.match(replay,/pen\[i\]=-2\*poisson[\s\S]{0,180}\?5\*poisson/,file+' penalty scoring drifted')
  assert.match(replay,/bon=3[\s\S]{0,180}\[3,2,1\]/,file+' bonus scoring drifted')
}

console.log('rulesParity: canonical rules, replay scoring and optimizer constants are aligned')
