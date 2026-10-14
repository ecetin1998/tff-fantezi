const assert=require('node:assert/strict')
const {simulateScout,bonusByCompetitionRank}=require('./simulateScout')
// The Python and Edge optimizers separately maximize additive marginal xFP.

function fixture(awayLambda=0){
  const players=[]
  for(const club of [1,2]){
    for(const [pos,n] of [['GK',1],['DEF',4],['MID',5],['FWD',1]]){
      for(let i=0;i<n;i++)players.push({
        id:players.length+1,club,pos,rates:Array(12).fill(0),
        durations:[90],duration_weights:[1],avail:1,role:.99,benchw:1,valid_games:1
      })
    }
  }
  return {players,matches:[{match_id:1,home_id:1,away_id:2,home_lambda:0,away_lambda:awayLambda}],
    team_checks:[1,2].map(club=>({club,formation:{GK:1,DEF:4,MID:5,FWD:1}})),
    temperature:1,assist_fraction:0,own_fraction:0,playerMatches:[]}
}

// MH7 finalized source (match 317843, 2026-10-12): one player with seven
// base Fantasy points received +3; EIGHT players with six base points
// each received +2, totalling 19 bonus across that one match.
// The 3-2-1 cap must NOT be imposed when genuine points-rank ties exist.
{
  const indices=[0,1,2,3,4,5,6,7,8]
  const base=Object.fromEntries(indices.map(i=>[i,i===0?7:6]))
  const mins=Array(9).fill(90)
  const bonus=bonusByCompetitionRank(indices,base,mins)
  assert.equal(bonus[0],3)
  for(let i=1;i<9;i++)assert.equal(bonus[i],2)
  assert.equal(Object.values(bonus).reduce((a,b)=>a+b,0),19,
    'Source-backed second-place ties must not be arbitrarily capped at six')
}

// Both teams keep clean sheets in 0-0; this does not imply that both defenders
// earn those clean-sheet points when either team actually scores.
{
  const rows=simulateScout(fixture(),30,20261014)
  assert(rows.filter(p=>p.pos==='DEF').every(p=>Math.abs(p.components.cs-4)<1e-9),
    'The same 0-0 score awards +4 clean sheets on both sides')
  const goalRows=simulateScout(fixture(3),1500,20261015)
  const home=goalRows.filter(p=>p.club===1&&p.pos==='DEF')
  const away=goalRows.filter(p=>p.club===2&&p.pos==='DEF')
  assert(home.every(p=>p.components.cs<1),'When the away team often scores, home CS expectation must fall')
  assert(away.every(p=>Math.abs(p.components.cs-4)<1e-9),
    'Away clean sheets remain intact when home goal lambda is exactly zero')
}

console.log('Source-backed defensive match scenario and bonus tie QA passed')


/*
 * Actual closed MH7 match 317840:
 * two players at seven base points => +3 each;
 * six players at six base points => +1 each (not +2).
 * The official top-three competition-rank rule skips occupied places.
 * Do not switch to dense-rank awards based solely on tier count.
 */
{
  const examples=[
    {base:[8,7,6],bonus:[3,2,1]},
    {base:[8,8,6],bonus:[3,3,1]},
    {base:[8,8,8,6],bonus:[3,3,3,0]},
    {base:[8,7,7,6],bonus:[3,2,2,0]},
    {base:[8,8,7,7],bonus:[3,3,1,1]},
    {base:[8,8,8,8],bonus:[3,3,3,3]},
  ];
  for(const example of examples){
    const ids=example.base.map((_,i)=>i)
    const scores=Object.fromEntries(ids.map(i=>[i,example.base[i]]))
    const result=bonusByCompetitionRank(ids,scores,ids.map(()=>90))
    assert.deepEqual(ids.map(i=>result[i]||0),example.bonus,
      'Bonus tie must match closed-match competition ranks: '+example.base.join(','))
  }
}

{
  const zero=simulateScout(fixture(),35,20261014)
  for(const p of zero){
    const expected=p.pos==='GK'||p.pos==='DEF'?4:p.pos==='MID'?1:0
    assert(Math.abs(p.components.cs-expected)<1e-9,
      'Every eligible midfield, backline and keeper position earns correct 0-0 CS')
    if(p.pos==='GK'||p.pos==='DEF')
      assert(Math.abs(p.bonus-3)<1e-9,'Any non-scoring GK/DEF tied first on fantasy base points may earn +3')
  }

  const attack=fixture(3)
  const awayForward=attack.players.find(p=>p.club===2&&p.pos==='FWD')
  awayForward.rates[0]=6
  awayForward.rates[1]=3
  const outcomes=simulateScout(attack,1200,20261015)
  const find=(rows,club,pos)=>rows.find(p=>p.club===club&&p.pos===pos)
  const homeDef=find(outcomes,1,'DEF')
  const homeMid=find(outcomes,1,'MID')
  const awayDef=find(outcomes,2,'DEF')
  const awayMid=find(outcomes,2,'MID')
  const forward=find(outcomes,2,'FWD')
  assert(forward.xgoal>2,'The away forward scores in the same shared fixture scenarios')
  assert(homeDef.components.cs<.6&&homeDef.components.cs>=0,
    'Opponent forward goals remove home DEF +4 clean sheets')
  assert(homeMid.components.cs<.15&&homeMid.components.cs>=0,
    'Opponent forward goals also remove home MID +1 clean sheets')
  assert(find(outcomes,1,'GK').components.cs<.6,
    'Opposing forward goals remove goalkeeper +4 clean sheet')
  assert(homeDef.components.conceded<-.3,
    'Every two opponent goals additionally penalize home GK/DEF')
  assert(Math.abs(awayDef.components.cs-4)<1e-9,
    'Away DEF keeps +4 when home cannot score')
  assert(Math.abs(awayMid.components.cs-1)<1e-9,
    'Away MID keeps +1 when home cannot score')
  assert(homeDef.xfp<find(zero,1,'DEF').xfp-1,
    'Opposing attack lowers expected GK/DEF returns, not just headline CS')
  assert(homeMid.xfp<find(zero,1,'MID').xfp,
    'Opposing attack lowers expected non-scoring MID returns')
  assert(forward.xfp>find(zero,2,'FWD').xfp+3,
    'Scoring forward gains xFP in the same fixture that hurts opposing defence')
}

{
  const fs=require('node:fs')
  const edge=fs.readFileSync('supabase/functions/run-live-sim-chunk/index.ts','utf8')
  assert.match(edge,/const score=\[teamGoals\(match\.home_lambda\),teamGoals\(match\.away_lambda\)\]/,
    'Production simulation must use a common goal outcome for both sides')
  assert.match(edge,/comp\.cs\[i\]=mins\[i\]>=60&&score\[p\.club===clubs\[0\]\?1:0\]===0/,
    'Production opponent-goal event governs keeper, DEF and MID clean sheets')
  assert.match(edge,/bonusByCompetitionRank\(both,base,mins,SCORING\)/,
    'Production tie bonus must remain connected to shared-match base scores')
}
