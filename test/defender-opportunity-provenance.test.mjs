import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createRequire} from "node:module"
import {credibleAttackWeights} from "../supabase/functions/weekly-model-lifecycle/defenderOpportunity.mjs"
const require=createRequire(import.meta.url)
const {attackWeights}=require("../model/attackAllocation.js")

const rates=({xg=.1,goals=.15,assists=.28,xa=.12,shots=-1,keys=-1}={})=>
  [xg,goals,assists,xa,0,0,0,0,0,0,Math.max(0,shots),0,keys,shots]

test("low-frequency defender chance events are discounted, never multiplied by recent goal points",()=>{
  const sporadic=credibleAttackWeights("DEF","WB",rates({shots:.43,keys:.86}))
  const unsourced=credibleAttackWeights("DEF","WB",rates())
  assert.ok(sporadic.goal<unsourced.goal*.80, "three shots in seven full matches do not justify repeat xG")
  assert.ok(sporadic.assist<unsourced.assist*.80,"rare key passes suppress unsustainable assist concentration")
  assert.ok(sporadic.goal>0&&sporadic.assist>0)
  // A genuine attacking fullback with frequent shots/passes retains the opportunity.
  const regular=credibleAttackWeights("DEF","FB",rates({shots:1.3,keys:2.5}))
  assert.ok(regular.goal>sporadic.goal&&regular.assist>sporadic.assist)
  assert.equal(regular.adjustedXg,.1)
  assert.equal(regular.adjustedXa,.12)
})

test("a real creative WB is not punished for creating chances every game",()=>{
  const productive=credibleAttackWeights("DEF","WB",rates({
    xg:.004,goals:0,xa:.192,assists:.22,shots:0,keys:2.56
  }))
  assert.ok(productive.assist>.18)
  assert.ok(productive.goal>0)
  const cb=credibleAttackWeights("DEF","CB",rates({
    xg:.045,goals:0,xa:.064,assists:0,shots:.18,keys:.18
  }))
  assert.ok(cb.adjustedXg<.04&&cb.adjustedXa<.04)
})

test("missing season opportunity is unknown, not a fabricated 0",()=>{
  const noEvidence=credibleAttackWeights("DEF","WB",rates({xg:.16,xa:.17,shots:-1,keys:-1}))
  assert.equal(noEvidence.adjustedXg,.16)
  assert.equal(noEvidence.adjustedXa,.17)
  const fwd=credibleAttackWeights("FWD","ST",rates({xg:.5,goals:.4,xa:.1,assists:.08,shots:0,keys:0}))
  assert.equal(fwd.goal,.75*.5+.25*.4)
  assert.equal(fwd.assist,.7*.1+.3*.08)
})

test("local scorer, current Edge and lifecycle use same defender weights",()=>{
  const p={id:1,pos:"DEF",sub_role:"WB",rates:rates({shots:.43,keys:.86}),source_note:"role-aware-attack-v1"}
  const local=attackWeights(p,[])
  const pure=credibleAttackWeights(p.pos,p.sub_role,p.rates)
  assert.equal(local.goal,pure.goal)
  assert.equal(local.assist,pure.assist)
  const lifecycle=readFileSync(new URL("../supabase/functions/weekly-model-lifecycle/index.ts",import.meta.url),"utf8")
  const edge=readFileSync(new URL("../supabase/functions/run-live-sim-chunk/index.ts",import.meta.url),"utf8")
  assert.match(lifecycle,/rates\[12\]=alignedOpportunity/)
  assert.match(lifecycle,/rates\[13\]=alignedOpportunity/)
  assert.match(lifecycle,/credibleAttackWeights\(input\?\.position,input\?\.sub_role,input\?\.rates\|\|\[\]\)/)
  assert.match(edge,/return credibleAttackWeights\(p\.pos,role,rates,adjustedXg\)/)
  assert.match(edge,/\.90\*adjustedXg\+\.10\*goals/)
  assert.match(edge,/\.90\*adjustedXa\+\.10\*assists/)
})
