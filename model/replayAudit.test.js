const assert=require('node:assert/strict')
const {buildReplayInput,evaluateReplay}=require('./replayAudit')

const payload={
  meta:{temperature:1.7,assist_fraction:.7,own_goal_fraction:.02,team_formations:{'101':{GK:1,DEF:4,MID:5,FWD:1}}},
  players:[
    {player_id:2,club_id:205,position:'FWD',price:6,availability:.9,role_probability:.7,bench_weight:.8,rates:[0,0,0,0],durations:[75],duration_weights:[1]},
    {player_id:1,club_id:101,position:'MID',price:5,availability:1,role_probability:.8,bench_weight:1,rates:[0,0,0,0],durations:[90],duration_weights:[1]},
  ],
  matches:[{match_id:9,home_team_id:101,away_team_id:205,home_lambda:1.2,away_lambda:.8}],
}
const history=[{id:2,gw:2,mins:75,xg:.1,shots:1},{id:1,gw:1,mins:90,xg:.2,shots:2}]
const input=buildReplayInput(payload,history)

assert.deepEqual(input.team_checks.map(x=>x.club),[101,205])
assert.equal(input.team_checks[0].formation.MID,5)
assert.equal(input.team_checks[1].formation.DEF,4)
assert.deepEqual(input.players.map(x=>x.id),[1,2])
assert.deepEqual(input.playerMatches.map(x=>x.id),[1,2])

const out=[
  {id:1,xfp:5,minutes:90,p25:2,p90:8},
  {id:2,xfp:2,minutes:30,p25:0,p90:5},
]
const actuals=[
  {player_id:1,points:6,minutes:85},
  {player_id:2,points:1,minutes:40},
]
const m=evaluateReplay(out,actuals)
assert.equal(m.player_sample,2)
assert.equal(m.average_point_error,1)
assert.equal(m.average_minute_error,7.5)
assert.equal(m.band_hit_rate,1)
assert.ok(Number.isFinite(m.ranking_alignment))

console.log('replay audit checks passed')
