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

const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260927130000_single_source_game_rules.sql'),'utf8')
const match=sql.match(/\$rules\$([\s\S]*?)\$rules\$::jsonb/)
assert.ok(match,'SQL rules seed not found')
assert.deepEqual(JSON.parse(match[1]),canonical)

console.log('rulesParity: JS, Python and SQL seed match rules/tff-fantasy.json')
