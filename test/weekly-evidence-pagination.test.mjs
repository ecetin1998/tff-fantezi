import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fetchTrustedWeeklyEvidence} from '../supabase/functions/weekly-model-lifecycle/weeklyEvidence.mjs'
import {risingMinutesMomentum} from '../supabase/functions/weekly-model-lifecycle/momentum.mjs'

function mockSupabase(rows) {
  const pages=[]
  const sb={from(table) {
    assert.equal(table,'scout_player_weekly_points')
    const chain={
      select:()=>chain,gte:()=>chain,lt:()=>chain,eq:()=>chain,order:()=>chain,
      range:async (start,end)=>{
        pages.push([start,end])
        return {data:rows.slice(start,end+1),error:null}
      }
    }
    return chain
  }}
  return {sb,pages}
}

test('MH9 source history is paginated beyond 1,000 rows without synthetic zeros',async()=>{
  const rows=[]
  for(const gameweek of [8,7,6,5]){
    for(let player_id=1;player_id<=600;player_id++){
      rows.push({player_id,gameweek,match_id:gameweek,minutes:90,points:2,is_final:true,source_kind:'fresh_closed_actual'})
    }
  }
  const {sb,pages}=mockSupabase(rows)
  const result=await fetchTrustedWeeklyEvidence(sb,9)
  assert.equal(result.error,null)
  assert.equal(result.data.length,2400)
  assert.equal(pages.length,5)
  assert.deepEqual(pages[0],[0,499])
  assert.deepEqual(pages[4],[2000,2499])
  const player=result.data.filter(x=>x.player_id===2)
  assert.deepEqual(player.map(x=>x.gameweek),[8,7,6,5])
  assert.equal(risingMinutesMomentum(player,9).rising,false,
    'steady four-week starters must not receive breakout momentum')
})

test('worker uses fully paginated evidence for weekly rollover and intraday refresh',()=>{
  const worker=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
  assert.match(worker,/import \{fetchTrustedWeeklyEvidence\} from "\.\/weeklyEvidence\.mjs"/)
  assert.match(worker,/fetchTrustedWeeklyEvidence\(sb,target\)/)
  assert.match(worker,/fetchTrustedWeeklyEvidence\(sb,gw\)/)
  assert.doesNotMatch(worker,/scout_player_weekly_points"\)\.select\([^\n]+\.limit\(10000\)/)
})
