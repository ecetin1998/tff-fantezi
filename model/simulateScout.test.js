const assert=require('node:assert/strict')
const {simulateScout,cardPoints,appearancePoints,expectedKeeperSaves,keeperSavesForScore,keeperPenaltySaveChance,bonusByCompetitionRank,redCardExitMinute,isActiveAt}=require('./simulateScout')

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
assert.equal(appearancePoints(0),0,'no appearance points without minutes')
assert.equal(appearancePoints(59),1,'under 60 minutes is one point')
assert.equal(appearancePoints(60),1,'exactly 60 minutes is still one point under the official rule')
assert.equal(appearancePoints(61),2,'the second appearance point starts only above 60 minutes')

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
  // Last saves reflect previous opposition as well as ability. They should not
  // create an independent large bonus for a goalkeeper opposing a hot striker.
  const averageKeeper=expectedKeeperSaves(1.6,3,1);
  const hotKeeper=expectedKeeperSaves(1.6,6,1);
  assert(hotKeeper>averageKeeper,'legitimate keeper form still contributes a little');
  assert(hotKeeper-averageKeeper<.9,'past saves cannot dominate opponent-based shot volume');
  assert(hotKeeper<4.2,'a high historical save rate must be shrunk toward the league prior');
  const fs=require('node:fs');
  for(const edge of ['supabase/functions/run-live-sim-chunk/index.ts','supabase/functions/run-enrichment-replay-chunk/index.ts']){
    assert.match(fs.readFileSync(edge,'utf8'),/\.66\+\.015\*\(num\(per90Saves\)-3\)/,
      edge+' must match the local simulation goalkeeper calibration');
  }
}

{
  const ids=[0,1,2,3],base={0:10,1:10,2:8,3:7},minutes=[90,90,90,90];
  const bonus=bonusByCompetitionRank(ids,base,minutes);
  assert.equal(bonus[0],3);
  assert.equal(bonus[1],3);
  assert.equal(bonus[2],2,'first-place tie shares +3; next tier receives +2');
  assert.equal(bonus[3],undefined);
}

{
  const exit=redCardExitMinute(0,90,.42);
  assert(exit>0&&exit<90,'red card must end the player minute before full time');
  assert.equal(isActiveAt(0,exit,exit-1),true);
  assert.equal(isActiveAt(0,exit,exit),false,'dismissed player cannot be selected for scoring/assist events after red');
}

console.log('DGW, opponent-aware saves, red-card and bonus-tie checks passed');

{
  const input=zeroEventInput(false);
  input.matches[0].away_lambda=1.15;
  for(const p of input.players.filter(x=>x.club===1&&x.pos==='DEF')){p.durations=[90];p.duration_weights=[1];p.role=1;}
  const out=simulateScout(input,5000,20261006).filter(p=>p.club===1&&p.pos==='DEF'&&p.minutes>=80);
  assert.ok(out.length>=2,'DEF QA needs at least two stable defenders');
  const cs=out.map(p=>p.components.cs),conceded=out.map(p=>p.components.conceded);
  assert.ok(Math.max(...cs)-Math.min(...cs)<.12,'same-team stable DEF clean-sheet expectation should align');
  assert.ok(Math.max(...conceded)-Math.min(...conceded)<.12,'same-team stable DEF conceded expectation should align');
}


// Scenario-coupled keeper returns: a conceded goal consumes one on-target shot.
{
  const shotDraw=()=>11;
  assert.equal(keeperSavesForScore(2,2,5.4,1,shotDraw),9,
    '11 on-target shots including two goals give exactly nine regular saves');
  assert.equal(keeperSavesForScore(5,2,5.4,1,shotDraw),6,
    'more conceded goals in the SAME 11 shots leave fewer saves');
  assert.equal(keeperSavesForScore(14,2,5.4,1,shotDraw),0,
    'saves cannot become negative when the sampled fixture scores many goals');
  assert.equal(keeperSavesForScore(0,0,5.4,1,()=>0),0,
    'a match with exactly zero attacking xG must not invent goalkeeper saves');
  assert.equal(2+Math.floor(9/3)-Math.floor(2/2),4,
    '90min + nine saves - two conceded (zero CS) is four base Fantasy points');
}

// Rare events cannot give a goalkeeper a free +0.5 xFP every week.
{
  const nearTwoGoals=keeperPenaltySaveChance(.0768226686,2.0,1);
  const keeperLow=keeperPenaltySaveChance(.0227476515,1.074,1);
  assert(nearTwoGoals>keeperLow,'player baseline can still weakly inform PK-save odds');
  assert(nearTwoGoals<.037,'penalty save should be rarer than once per 27 GK matches');
  assert(nearTwoGoals*5<.19,'maximum penal-save EV should remain a small part of xFP');
  assert(keeperPenaltySaveChance(.0768,2,0)===0,'non-playing keeper cannot save penalties');
  assert.equal(keeperPenaltySaveChance(.1,0,1),0,
    'an attack with zero expected shots must never generate saved penalties');
  assert(keeperPenaltySaveChance(1,9,1)<=.036,'bad priors cannot manufacture implausible events');
}

// Bonus depends only on realised fantasy BASE points: no CB, FB, MID or FWD
// handicap/boost is allowed after identical point events.
{
  const id=[0,1,2],base={0:7,1:6,2:6};
  // GK: 7 base; MID: 2 appearance+1 CS+3 assist; DEF: 2 appearance+4 CS.
  const b=bonusByCompetitionRank(id,base,[90,90,90]);
  assert.deepEqual([b[0],b[1],b[2]],[3,2,2],
    'MID assist and DEF clean sheet tied at 6 get the same official tier bonus');
}

{
  const fs=require('node:fs');
  for(const f of ['supabase/functions/run-live-sim-chunk/index.ts','supabase/functions/run-enrichment-replay-chunk/index.ts']){
    const edge=fs.readFileSync(f,'utf8');
    assert.match(edge,/keeperSavesForScore\(gc\[i\],opponentLambda,rates\[6\],exposure,poisson\)/,
      f+' must couple saves to the actual conceded match score');
    assert.match(edge,/keeperPenaltySaveChance\(P\[opponentGK\]\.rates\[8\],attackingLambda,mins\[opponentGK\]\/90\)/,
      f+' must use the defending goalkeeper prior for the same penalty attempt');
    assert.match(edge,/comp\.penalties\[taker\]\+=SCORING\.penalty_miss/,
      f+' saved or missed penalty must debit the attacking taker');
    assert.match(edge,/comp\.penalties\[opponentGK\]\+=SCORING\.penalty_save/,
      f+' the same saved penalty must credit the defending keeper');
    assert.doesNotMatch(edge,/penalty_miss\*poisson\(rates\[7\]/,
      f+' must never independently create multiple missed penalties per player');
    assert.doesNotMatch(edge,/penalty_save\*poisson\(rates\[8\]/,
      f+' must not use amplified Poisson penalty saves');
  }
}


// Match-level missed penalty and keeper save must occur together; no player-level
// independent Poisson that can miss multiple penalties on a single draw.
{
  const input=zeroEventInput(false);
  input.matches[0].home_lambda=.85;
  input.matches[0].away_lambda=.85;
  for(const p of input.players){
    p.rates[7]=p.pos==='FWD'?.05:0;
    if(p.pos==='GK')p.rates[8]=.20;
  }
  const out=simulateScout(input,12000,20261015);
  const saved=out.filter(p=>p.pos==='GK').reduce((s,p)=>s+p.components.penalties,0)/5;
  const missed=-out.filter(p=>p.pos!=='GK').reduce((s,p)=>s+p.components.penalties,0)/2;
  assert(saved>=0&&saved<.1,'saved penalties are rare, below .1 per fixture');
  assert(missed>=saved-1e-9,
    'each keeper saved penalty must also debit a real attacking penalty taker');
  assert(missed<.15,'off-target missed penalties are rare and not added per player');
}


// A source SHA bump must NEVER silently re-run 50K against an old deployed
// Supabase scorer and then mark the candidate as the new current run.
{
  const fs=require('node:fs');
  const edge=fs.readFileSync('supabase/functions/run-live-sim-chunk/index.ts','utf8');
  const workflow=fs.readFileSync('.github/workflows/weekly-model-lifecycle.yml','utf8');
  assert.match(edge,/SCORER_POLICY_VERSION="gk-sot-penalty-matched-v1"/);
  assert.equal((workflow.match(/MODEL_SCORER_POLICY_MISMATCH/g)||[]).length,6,
    'both current-MH and next-MH runs must enforce scorer policy on reset/chunks/finalize');
}
