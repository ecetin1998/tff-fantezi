const assert=require('node:assert/strict')
const {simulateScout,cardPoints}=require('./simulateScout')

function player(id,club,pos='MID'){
  return {
    id,club,pos,
    rates:[0.25,0.15,0.12,0.10,0,0,0,0,0],
    durations:[90],duration_weights:[1],
    avail:1,role:0.9,benchw:1,valid_games:1
  }
}

function baseInput(){
  const players=[]
  for(let i=0;i<11;i++)players.push(player(100+i,101))
  for(let i=0;i<11;i++)players.push(player(200+i,205))
  players.push(player(999,999))
  return {
    players,
    matches:[{home_id:101,away_id:205,home_lambda:0,away_lambda:0}],
    team_checks:[
      {club:101,formation:{GK:0,DEF:0,MID:11,FWD:0}},
      {club:205,formation:{GK:0,DEF:0,MID:11,FWD:0}}
    ],
    temperature:1,
    assist_fraction:0,
    own_fraction:0,
    playerMatches:[]
  }
}

{
  const out=simulateScout(baseInput(),20,4242)
  for(const club of [101,205]){
    const rows=out.filter(p=>p.club===club)
    assert.ok(Math.abs(rows.reduce((s,p)=>s+p.xi,0)-11)<1e-9,'each club must start 11 players')
    assert.ok(Math.abs(rows.reduce((s,p)=>s+p.minutes,0)-990)<1e-9,'each club must total 990 player-minutes')
  }
  const noMatch=out.find(p=>p.id===999)
  assert.equal(noMatch.p25,0)
  assert.equal(noMatch.p90,0)
  assert.ok(Number.isFinite(noMatch.std)&&Number.isFinite(noMatch.mc_se),'no-match distribution metrics stay finite')
}

{
  const input=baseInput()
  input.matches[0].home_lambda=1.5
  input.assist_fraction=1
  input.own_fraction=1
  const out=simulateScout(input,1000,1337)
  const home=out.filter(p=>p.club===101)
  const away=out.filter(p=>p.club===205)
  assert.equal(home.reduce((s,p)=>s+p.xgoal,0),0,'own goals must not create an attacking scorer')
  assert.ok(home.reduce((s,p)=>s+p.xassist,0)>0,'credited assists may coexist with own goals')
  assert.ok(away.reduce((s,p)=>s+p.components.own,0)<0,'own-goal deduction must land on defending team')
}

assert.equal(cardPoints(true,false),-1,'yellow card is -1')
assert.equal(cardPoints(false,true),-3,'red card is -3')
assert.equal(cardPoints(true,true),-3,'second-yellow dismissal is -3 total, not -4')

console.log('simulateScout checks passed')
