const assert=require('node:assert/strict')
const {simulateScout,cardPoints,expectedKeeperSaves,bonusByCompetitionRank,redCardExitMinute,isActiveAt}=require('./simulateScout')

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


function zeroEventInput(doubleWeek=false){
  const players=[];
  let id=1;
  for(const club of [1,2]){
    for(const [pos,count] of [['GK',1],['DEF',4],['MID',5],['FWD',1]]){
      for(let n=0;n<count;n++)players.push({
        id:id++,club,pos,price:5,rates:Array(12).fill(0),
        durations:[90],duration_weights:[1],avail:1,role:.99,benchw:1,valid_games:1
      });
    }
  }
  const fixture={home_id:1,away_id:2,home_lambda:0,away_lambda:0};
  return {
    players,
    matches:doubleWeek?[{...fixture,match_id:1},{...fixture,match_id:2}]:[{...fixture,match_id:1}],
    team_checks:[
      {club:1,formation:{GK:1,DEF:4,MID:5,FWD:1}},
      {club:2,formation:{GK:1,DEF:4,MID:5,FWD:1}},
    ],
    temperature:1.7,assist_fraction:0,own_fraction:0,playerMatches:[]
  };
}

{
  const single=simulateScout(zeroEventInput(false),50,20260927);
  const double=simulateScout(zeroEventInput(true),50,20260927);
  for(let i=0;i<single.length;i++){
    assert.ok(double[i].xi<=1+1e-12&&Math.abs(double[i].xi-1)<1e-9,'DGW weekly XI is P(start at least once), never a sum above 1');
    assert.ok(Math.abs(double[i].minutes-180)<1e-9,'DGW minutes are accumulated match by match');
    assert.ok(Math.abs(double[i].xfp-single[i].xfp*2)<1e-9,'two zero-event fixtures contribute twice the single-match xFP');
    assert.ok(Number.isFinite(double[i].match_xi['1'])&&double[i].match_xi['1']>=0&&double[i].match_xi['1']<=1,'first DGW fixture XI probability is stored separately');
    assert.ok(Number.isFinite(double[i].match_xi['2'])&&double[i].match_xi['2']>=0&&double[i].match_xi['2']<=1,'second DGW fixture XI probability is stored separately');
  }
}

{
  const weak=expectedKeeperSaves(.65,3.2,1);
  const strong=expectedKeeperSaves(2.0,3.2,1);
  assert(strong>weak,'keeper save expectation must increase with opponent attacking pressure');
}

{
  const ids=[0,1,2,3],base={0:10,1:10,2:8,3:7},minutes=[90,90,90,90];
  const bonus=bonusByCompetitionRank(ids,base,minutes);
  assert.equal(bonus[0],3);
  assert.equal(bonus[1],3);
  assert.equal(bonus[2],1,'two players tied first occupy the first two places; next player is rank three');
  assert.equal(bonus[3],undefined);
}

{
  const exit=redCardExitMinute(0,90,.42);
  assert(exit>0&&exit<90,'red card must end the player minute before full time');
  assert.equal(isActiveAt(0,exit,exit-1),true);
  assert.equal(isActiveAt(0,exit,exit),false,'dismissed player cannot be selected for scoring/assist events after red');
}

console.log('DGW, opponent-aware saves, red-card and bonus-tie checks passed');
