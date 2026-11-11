import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
test("team goals and advanced stats use independently sourced periods",()=>{
  const s=read("app/teams/[id]/page.js")
  assert.match(s,/advancedMatches>0\?Number\(s\?\.shots\|\|0\)\/advancedMatches/)
  assert.match(s,/advancedMatches>0\?Number\(s\?\.opponent_sot\|\|0\)\/advancedMatches/)
  assert.match(s,/const hasAlignedGoals=advancedMatches>0&&advancedMatches===matchesPlayed/)
  assert.match(s,/finishingDelta===null\?'—'/)
  assert.match(s,/defensiveDelta===null\?'—'/)
  assert.match(s,/MH1–MH\{advancedWeek\}/)
  assert.doesNotMatch(s,/Number\(s\?\.shots\|\|0\)\/safeMatches/)
  assert.doesNotMatch(s,/Number\(s\?\.goals_for\|\|0\)-Number\(s\?\.xg_total\|\|0\)(?!:null)/)
})
test("player card labels last verified advanced week and does not count DNP as an advanced zero",()=>{
  const s=read("app/players/[id]/page.js")
  assert.match(s,/seasonWeek>advancedWeek/)
  assert.match(s,/advancedNote/)
  assert.match(s,/DNP bağımsız doğrulanmalı/)
  assert.match(s,/advancedStale\?/)
  assert.doesNotMatch(s,/advanced_through_gameweek:\s*seasonWeek/)
})
test("legacy model snapshots remain untouched by UI-only coverage changes",()=>{
  const t=read("app/teams/[id]/page.js"),p=read("app/players/[id]/page.js")
  assert.doesNotMatch(t,/update\(|upsert\(|delete\(/)
  assert.doesNotMatch(p,/update\(|upsert\(|delete\(/)
})
