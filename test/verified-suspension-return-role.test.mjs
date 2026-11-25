import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {restoreVerifiedSuspensionReturn} from "../supabase/functions/weekly-model-lifecycle/suspensionReturn.mjs"

const now="2026-11-20T15:00:00Z"
const weekly=[
 {gameweek:11,is_final:true,minutes:0,source_updated_at:"2026-11-08T12:00:00Z"},
 {gameweek:10,is_final:true,minutes:0,source_updated_at:"2026-11-02T12:00:00Z"},
 {gameweek:9,is_final:true,minutes:90,source_updated_at:"2026-10-27T00:00:00Z"},
 {gameweek:8,is_final:true,minutes:90,source_updated_at:"2026-10-21T00:00:00Z"},
 {gameweek:7,is_final:true,minutes:77,source_updated_at:"2026-10-14T00:00:00Z"},
]
const tactical=[
 {gameweek:9,team_id:17,started:true,verified:true,minutes:90,observed_at:"2026-11-15T21:00:00Z"},
 {gameweek:8,team_id:17,started:true,verified:true,minutes:90,observed_at:"2026-10-21T21:00:00Z"},
 {gameweek:7,team_id:17,started:true,verified:true,minutes:77,observed_at:"2026-10-21T21:00:00Z"},
]
const caseRecord={player_id:533,team_id:17,offense_gameweek:9,affected_gameweeks:[10,11]}
const params={baseline:.33314814814814814,targetWeek:12,availability:1,
 seasonStarts:8,matchesPlayed:9,cases:[caseRecord],weekly,tactical,teamId:17,cutoffAt:now}

test("Abdülkerim: two official DNP suspensions are NOT rotation evidence after ban ends",()=>{
 const result=restoreVerifiedSuspensionReturn(params)
 assert.equal(result.applied,true)
 assert.equal(result.reason,"official_ban_served_pre_ban_starter_role_restored")
 assert.deepEqual(result.ban_weeks,[10,11])
 assert.deepEqual(result.evidence_weeks,[9,8,7])
 assert.ok(Math.abs(result.role-9/11)<1e-9)
 assert.ok(result.role<.9)
 assert.ok(result.delta>.45)
})

test("do not override ongoing bans, not fully available players or other team's ban",()=>{
 assert.equal(restoreVerifiedSuspensionReturn({...params,targetWeek:11}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,availability:.5}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,teamId:6}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,cases:[]}).applied,false)
})

test("do not invent a restored starter with insufficient sourced pre-ban XI",()=>{
 assert.equal(restoreVerifiedSuspensionReturn({...params,tactical:tactical.slice(0,1)}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,weekly:weekly.filter(w=>w.gameweek!==10)}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,weekly:weekly.map(w=>({...w,minutes:w.gameweek===11?55:w.minutes}))}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,tactical:tactical.map(w=>({...w,observed_at:"2026-11-22T00:00:00Z"}))}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,seasonStarts:2}).applied,false)
})

test("pre-ban regular starters never become guaranteed; no cumulative boost on subsequent refresh",()=>{
 assert.equal(restoreVerifiedSuspensionReturn({...params,baseline:.95}).applied,false)
 assert.equal(restoreVerifiedSuspensionReturn({...params,alreadyApplied:true}).applied,false)
 const sourced=restoreVerifiedSuspensionReturn({...params,baseline:.5})
 assert.ok(sourced.role<=.88)
 assert.ok(sourced.role>=.75)
})

test("both current week and next week pipelines fetch same TFF verified bans",()=>{
 const s=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
 assert.match(s,/import \{restoreVerifiedSuspensionReturn\} from "\.\/suspensionReturn\.mjs"/)
 assert.equal((s.match(/scout_verified_disciplinary_cases/g)||[]).length,2)
 assert.equal((s.match(/restoreVerifiedSuspensionReturn\(\{/g)||[]).length,2)
 assert.match(s,/Math\.max\(1,gw-6\)/)
 assert.match(s,/Math\.max\(1,target-6\)/)
 assert.match(s,/verified-suspension-return-v1/)
 assert.match(s,/banReturn\.applied\?"CEZADAN DÖNÜŞ"/)
 assert.match(s,/baseline:banReturn\.role/)
})

test("exact provider lineup restores a missing tactical observation without inventing a start",async()=>{
 const {verifiedProviderStarts,roleRowsWithoutVerifiedBans}=await import("../supabase/functions/weekly-model-lifecycle/suspensionReturn.mjs")
 const provider={gameweek:7,team_id:17,match_id:123,provider_player_id:77,minutes:77,is_substitute:false,observed_at:"2026-11-15T00:00:00Z"}
 const lineup={gameweek:7,team_id:17,match_id:123,starter_count:11,observed_at:"2026-11-15T00:00:00Z",lineup:{initialLineup:[[{id:77},...Array.from({length:10},(_,i)=>({id:i+1}))]]}}
 const proof=verifiedProviderStarts([provider],[lineup])
 assert.equal(proof.length,1)
 const history=weekly.map(w=>({...w,match_id:w.gameweek===7?123:456}))
 assert.equal(restoreVerifiedSuspensionReturn({...params,weekly:history,tactical:[tactical[0],...proof]}).applied,true)
 assert.equal(restoreVerifiedSuspensionReturn({...params,weekly,tactical:[tactical[0],...proof]}).applied,false)
 assert.equal(verifiedProviderStarts([{...provider,is_substitute:true}],[lineup]).length,0)
 assert.equal(roleRowsWithoutVerifiedBans(history,[caseRecord],17,12,now).length,3)
 assert.equal(roleRowsWithoutVerifiedBans(history,[caseRecord],6,12,now).length,5)
})
