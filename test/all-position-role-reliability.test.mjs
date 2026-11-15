import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {calibrateAttackRates as adjust} from '../supabase/functions/weekly-model-lifecycle/roleAwareAttackRates.mjs'
import {currentTacticalRole} from '../supabase/functions/weekly-model-lifecycle/recentTacticalRole.mjs'

const metrics=(role,position,overrides={})=>adjust({
 role,position,seasonMinutes:720,seasonWeek:8,advancedWeek:7,
 xgPer90:.14,goalsPer90:0,xaPer90:.10,assistsPer90:0,
 shots:null,keyPasses:null,...overrides
})
test('full pool roles are evaluated conservatively, registered position is unchanged',()=>{
 const starter=metrics('ST','FWD',{xgPer90:.52,goalsPer90:.45,seasonMinutes:720})
 const wing=metrics('W','MID',{xgPer90:.30,seasonMinutes:540})
 const def=metrics('FB','DEF',{xgPer90:.20,seasonMinutes:720})
 const cb=metrics('CB','DEF',{xgPer90:.14,seasonMinutes:720})
 assert.ok(starter.xgPer90>=.52*.9,'established scorer is not arbitrarily cut')
 assert.ok(wing.xgPer90>=.30*.9,'regular winger keeps source-supported upside')
 assert.ok(def.xgPer90>=.20*.9,'attacking FB is not repressed as CB')
 assert.ok(cb.xgPer90<def.xgPer90)
})
test('only same-week plausible shooting and creation support advanced-role calibration',()=>{
 const stale=metrics('AM','MID',{xgPer90:.18,xaPer90:.30,seasonMinutes:360,advancedWeek:7,keyPasses:8,shots:5})
 const aligned=metrics('AM','MID',{xgPer90:.18,xaPer90:.30,seasonMinutes:360,advancedWeek:8,keyPasses:8,shots:5})
 assert.equal(stale.sourceAligned,false)
 assert.equal(stale.xaPer90,.30,'stale key passes cannot change current xA')
 assert.equal(aligned.sourceAligned,true)
 assert.ok(aligned.xaPer90<.30&&aligned.xaPer90>=.30*.88)
 const corrupt=metrics('W','MID',{advancedWeek:8,shots:81,keyPasses:60})
 assert.equal(corrupt.sourceAligned,false)
})
test('missing is never a verified zero, GK is excluded',()=>{
 const missing=metrics('W','MID',{xgPer90:null,shots:null})
 assert.equal(missing.applied,false)
 assert.equal(missing.xgPer90,null)
 const keeper=metrics('GK','GK',{xgPer90:0,goalsPer90:0})
 assert.equal(keeper.applied,false)
})
test('no role switch on one match or inconclusive mixed sources',()=>{
 const one=[{gameweek:8,role:'W',side:'R',started:true,verified:true,minutes:90}]
 const single=currentTacticalRole({baseRole:'WB',baseSide:'R',evidence:one,targetWeek:9})
 assert.equal(single.role,'WB')
 assert.equal(single.changed,false)
 const conflicting=[...one,{gameweek:7,role:'WB',side:'R',started:true,verified:true,minutes:90}]
 assert.equal(currentTacticalRole({baseRole:'WB',baseSide:'R',evidence:conflicting,targetWeek:9}).role,'WB')
})
test('two verified tactical starts override scouting role without changing Fantasy registration',()=>{
 const evidence=[{gameweek:8,role:'W',side:'R',started:true,verified:true,minutes:90},
 {gameweek:7,role:'W',side:'R',started:true,verified:true,minutes:80},
 {gameweek:6,role:'WB',side:'R',started:true,verified:true,minutes:90}]
 const model=currentTacticalRole({baseRole:'WB',baseSide:'R',evidence,targetWeek:9})
 assert.equal(model.role,'W')
 assert.equal(model.side,'R')
 assert.equal(model.changed,true)
 assert.equal(model.reason,'multi_match_verified_lineup')
 const dubious=[{gameweek:8,role:'W',side:'R',started:true,verified:false,minutes:90},
 {gameweek:7,role:'W',side:'R',started:true,verified:true,minutes:39}]
 assert.equal(currentTacticalRole({baseRole:'WB',evidence:dubious,targetWeek:9}).role,'WB')
})
test('weekly and intraday use the same source-trusted taxonomy and no double calibration',()=>{
 const text=readFileSync(new URL('../supabase/functions/weekly-model-lifecycle/index.ts',import.meta.url),'utf8')
 assert.match(text,/calibrateAttackRates\(/)
 assert.match(text,/currentTacticalRole\(/)
 assert.match(text,/role-aware-attack-v1/)
 assert.match(text,/alreadyCalibrated/)
 assert.match(text,/sourceStatsQ/)
 assert.match(text,/tacticalEvidence/)
 assert.match(text,/roleObservedAt/)
 assert.match(text,/sub_role:tactical\.role/)
 assert.doesNotMatch(text,/scout_player_season_stats"\)\.update\(/)
})

test('Kahveci verified central AM and Greenwood right wing are separate roles, with no fantasy category change',()=>{
 const rows=[{gameweek:9,role:'AM',side:'C',minutes:78},{gameweek:10,role:'AM',side:'C',minutes:90},{gameweek:11,role:'AM',side:'C',minutes:57}]
  .map(x=>({...x,started:true,verified:true,team_id:6,observed_at:'2026-11-15T21:11:29Z'}))
 const irfan=currentTacticalRole({baseRole:'W',baseSide:'R',evidence:rows,targetWeek:12,teamId:6,cutoffAt:'2026-11-21T16:00:00Z'})
 assert.equal(irfan.role,'AM')
 assert.equal(irfan.side,'C')
 assert.equal(irfan.trustedMatches,3)
 assert.equal(currentTacticalRole({baseRole:'W',baseSide:'R',evidence:rows,targetWeek:12,teamId:7,cutoffAt:'2026-11-21T16:00:00Z'}).role,'W')
 assert.equal(currentTacticalRole({baseRole:'W',baseSide:'R',evidence:rows,targetWeek:12,teamId:6,cutoffAt:'2026-11-15T21:00:00Z'}).role,'W')
})
test('a repeated flank role may be versatile rather than retaining a stale single side',()=>{
 const evidence=[{gameweek:9,role:'W',side:'L'},{gameweek:10,role:'W',side:'R'},{gameweek:11,role:'W',side:'L'}].map(x=>({...x,started:true,verified:true,minutes:80}))
 const role=currentTacticalRole({baseRole:'W',baseSide:'L',evidence,targetWeek:12})
 assert.equal(role.side,'BOTH')
 assert.equal(role.role,'W')
})

test('flat advanced 4-1-4-1 geometry is compatible with an established attacking-midfielder role',()=>{
 const evidence=[{gameweek:9,role:'CM',side:'C',source_position_label:'formation:4-1-4-1;line:3;x:0.678;y:0.375',minutes:90},
 {gameweek:10,role:'CM',side:'C',source_position_label:'formation:4-1-4-1;line:3;x:0.678;y:0.375',minutes:73},
 {gameweek:11,role:'CM',side:'L',source_position_label:'formation:4-3-3;line:2;x:0.613;y:0.210',minutes:80}].map(x=>({...x,started:true,verified:true}))
 assert.equal(currentTacticalRole({baseRole:'AM',baseSide:'C',evidence,targetWeek:12}).role,'AM')
 assert.equal(currentTacticalRole({baseRole:'AM',baseSide:'C',evidence:evidence.map(x=>({...x,source_position_label:'explicit:CM'})),targetWeek:12}).role,'CM')
})
test('a winger starting as a fullback in repeated verified layouts is not kept as a winger',()=>{
 const evidence=[9,10,11].map(gameweek=>({gameweek,role:'FB',side:'R',minutes:75,started:true,verified:true,source_position_label:'formation:4-2-3-1;line:1;x:0.292;y:0.875'}))
 assert.equal(currentTacticalRole({baseRole:'W',baseSide:'R',evidence,targetWeek:12}).role,'FB')
})

test('geometry-only ambiguous formation roles preserve compatible reviewed roles',()=>{
 const rows=[9,10,11].map(gameweek=>({gameweek,role:'CM',side:'C',started:true,verified:true,minutes:80,source_position_label:'formation:4-1-4-1;line:3;x:0.678;y:0.375'}))
 assert.equal(currentTacticalRole({baseRole:'AM',baseSide:'C',evidence:rows,targetWeek:12}).role,'AM')
 const wings=rows.map(row=>({...row,role:'WM',side:'R'}))
 assert.equal(currentTacticalRole({baseRole:'W',baseSide:'R',evidence:wings,targetWeek:12}).role,'W')
 const explicit=rows.map(row=>({...row,source_position_label:'CM'}))
 assert.equal(currentTacticalRole({baseRole:'AM',baseSide:'C',evidence:explicit,targetWeek:12}).role,'CM')
})
