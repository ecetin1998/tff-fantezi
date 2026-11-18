import test from 'node:test'
import assert from 'node:assert/strict'
import {buildPlayerForecastJournal} from '../lib/playerForecastJournal.mjs'
const runs=[
 {id:'a',gameweek:12,status:'ready',simulation_count:50000,generated_at:'2026-11-18T13:00:00Z',source_updated_at:'2026-11-18T13:02:00Z',model_version:'M1',is_current:false},
 {id:'b',gameweek:12,status:'ready',simulation_count:50000,generated_at:'2026-11-18T14:00:00Z',source_updated_at:'2026-11-18T14:02:00Z',model_version:'M1',is_current:false},
 {id:'c',gameweek:12,status:'ready',simulation_count:50000,generated_at:'2026-11-18T15:00:00Z',source_updated_at:'2026-11-18T14:02:00Z',model_version:'M1',is_current:false},
 {id:'d',gameweek:12,status:'ready',simulation_count:50000,generated_at:'2026-11-18T16:00:00Z',source_updated_at:'2026-11-18T16:02:00Z',model_version:'M2',is_current:true},
]
const pr=[
 {run_id:'a',xfp:3,xi_probability:.5,x_minutes:49,availability_probability:1},
 {run_id:'b',xfp:3.005,xi_probability:.501,x_minutes:49.2,availability_probability:1},
 {run_id:'c',xfp:3.3,xi_probability:.55,x_minutes:53,availability_probability:1},
 {run_id:'d',xfp:3.2,xi_probability:.5,x_minutes:53,availability_probability:.9}
]
test('only material changes are shown, never invent a cause',()=>{
 const r=buildPlayerForecastJournal(runs,pr,{gameweek:12,currentRunId:'d'})
 assert.equal(r.runsConsidered,4)
 assert.equal(r.entries.length,2)
 assert.equal(r.entries[0].id,'d')
 assert.equal(r.entries[0].changes.xfp,-.1)
 assert.equal(r.entries[0].sourceTimestampShift,true)
 assert.equal(r.entries[0].modelLabelShift,true)
 assert.match(r.entries[0].reason,/belirlenemez/)
 assert.equal(r.entries[1].id,'c')
 assert.equal(r.entries[1].sourceTimestampShift,false)
})
test('never compare different weeks, 0 draws, future runs or unready trial',()=>{
 const extras=[
 {id:'mh11',gameweek:11,status:'ready',simulation_count:50000,generated_at:'2026-11-10T12:00:00Z'},
 {id:'future',gameweek:12,status:'ready',simulation_count:50000,generated_at:'2026-11-19T12:00:00Z'},
 {id:'failed',gameweek:12,status:'failed',simulation_count:50000,generated_at:'2026-11-18T15:55:00Z'},
 {id:'partial',gameweek:12,status:'ready',simulation_count:1000,generated_at:'2026-11-18T15:55:00Z'}
 ]
 const rows=extras.map(x=>({...pr[0],run_id:x.id,xfp:20}))
 const x=buildPlayerForecastJournal([...runs,...extras],[...pr,...rows],{gameweek:12,currentRunId:'d'})
 assert.equal(x.runsConsidered,4)
 assert.equal(x.entries.length,2)
})
test('no current run, duplicate projection and invalid values fail closed',()=>{
 assert.deepEqual(buildPlayerForecastJournal(runs,pr,{gameweek:11,currentRunId:'d'}).entries,[])
 const p=[...pr,{...pr[1]}]
 assert.equal(buildPlayerForecastJournal(runs,p,{gameweek:12,currentRunId:'d'}).runsConsidered,3)
 const v=[...pr.slice(0,3),{...pr[3],xi_probability:1.8}]
 assert.equal(buildPlayerForecastJournal(runs,v,{gameweek:12,currentRunId:'d'}).runsConsidered,3)
})
test('zero values are valid and nulls are not fake zero deltas',()=>{
 const r=buildPlayerForecastJournal(runs,[...pr.slice(0,2),
   {...pr[2],xfp:0}, {...pr[3],xfp:0,availability_probability:null}
 ],{gameweek:12,currentRunId:'d'})
 assert.equal(r.runsConsidered,4)
 assert.equal(r.entries[0].changes.xfp,0)
 assert.equal(r.entries[0].changes.availability,null)
})
