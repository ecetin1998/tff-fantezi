import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"

const sql=readFileSync(new URL("../supabase/migrations/20261110221200_redcard_stint_qa_upper_bound.sql",import.meta.url),"utf8")
const upper=(minutes,redCards,seasonMinutes)=>
  seasonMinutes>0 ? .5*minutes*Math.min(.15,redCards*90/seasonMinutes) : 0
const tolerance=(loss)=>Math.max(6,loss+2)+.05

test("variance-aware red-card allowance follows E[D^2] <= 90 E[D], not E[D]^2",()=>{
  assert.match(sql,/coalesce\(st\.red_cards,0\)::numeric \* 90 \/ st\.minutes/)
  assert.doesNotMatch(sql,/coalesce\(st\.red_cards,0\)::numeric \* greatest\(coalesce\(p\.x_minutes,0\),0\) \/ st\.minutes/)
  const eyupRed=upper(49.12,1,610)+upper(49.87,1,661)
  assert.ok(eyupRed>6.9&&eyupRed<7.2)
  assert.ok(990-983.11<tolerance(eyupRed),"documented sourced Eyupspor event loss fits the variance bound")
})
test("missing red-card evidence retains strict minutes limit and all other QA gates",()=>{
  assert.equal(tolerance(upper(90,0,600)),6.05)
  assert.ok(8>tolerance(0),"non-red 8-minute loss must still fail")
  for (const expression of ["team_count=18","violations=0","simulation_count>=50000",
    "share_ok","optimizer_ok","quantile_order_violations=0","projection_range_violations=0"]){
    assert.ok(sql.includes(expression),expression)
  }
})
