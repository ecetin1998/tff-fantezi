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
