const fs=require('node:fs')
const assert=require('node:assert/strict')
const {normalizedDefenderRole,singleShotCap,attackWeights}=require('./attackAllocation')

const migration=fs.readFileSync('supabase/migrations/20260928002500_defender_subroles.sql','utf8')
for(const marker of [
  "add column if not exists source_position text",
  "add column if not exists sub_role text",
  "sub_role in ('CB','FB','WB')",
  "private.scout_defender_sub_role",
  "(259,'LB')",
  "(261,'CB')",
  "(277,'RB,RWB,RM,CB')",
  "(426,'CB')",
  "(427,'RWB,RM')",
  "(542,'RB')",
  "(567,'RWB,RB,RM,RW')",
  "update public.scout_replay_player_inputs"
])assert.ok(migration.includes(marker),marker+' missing from defender sub-role migration')

assert.equal(normalizedDefenderRole({pos:'DEF',sub_role:'CB'}),'CB')
assert.equal(normalizedDefenderRole({pos:'DEF',sub_role:'FB'}),'FB')
assert.equal(normalizedDefenderRole({pos:'DEF',sub_role:'WB'}),'WB')
assert(singleShotCap({pos:'DEF',sub_role:'CB'})<singleShotCap({pos:'DEF',sub_role:'FB'}))
assert(singleShotCap({pos:'DEF',sub_role:'FB'})<singleShotCap({pos:'DEF',sub_role:'WB'}))

const oneShot=[{id:1,mins:90,shots:1,xg:.55}]
const rates=[.18,.04,.06,.08,0,0,0,0,0]
const cb=attackWeights({id:1,pos:'DEF',sub_role:'CB',rates},oneShot)
const wb=attackWeights({id:1,pos:'DEF',sub_role:'WB',rates},oneShot)
assert(wb.adjustedXg>cb.adjustedXg,'wing-back must retain more isolated-shot threat than centre-back')

const types=fs.readFileSync('supabase/types/database.ts','utf8')
assert.match(types,/source_position: string \| null/)
assert.match(types,/sub_role: string \| null/)
assert.match(types,/sub_role_source: string \| null/)

console.log('defender sub-role contract passed')
