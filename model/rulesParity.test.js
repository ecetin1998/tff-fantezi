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

console.log('rulesParity: canonical rules and optimizer objective constants are aligned')
