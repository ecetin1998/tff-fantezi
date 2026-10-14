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
