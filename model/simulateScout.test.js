const assert=require('node:assert/strict')
const {simulateScout,cardPoints,adjustedRoleProbability,normalizedDurationDistribution,dixonColesTau,allocateBonus,redCardAdjustedLambdas,ROLE_CAP}=require('./simulateScout')
function player(id,club,pos='MID',overrides={}){return {id,club,pos,rates:[.25,.15,.12,.10,0,0,0,0,0],durations:[90],duration_weights:[1],avail:1,role:.9,confidence:'medium',team_position_prior:.75,benchw:1,valid_games:1,...overrides}}
function baseInput(extraHome=1){const players=[];for(let i=0;i<11+extraHome;i++)players.push(player(100+i,101));for(let i=0;i<12;i++)players.push(player(200+i,205));players.push(player(999,999));return {players,matches:[{home_id:101,away_id:205,home_lambda:0,away_lambda:0}],team_checks:[{club:101,formation:{GK:0,DEF:0,MID:11,FWD:0}},{club:205,formation:{GK:0,DEF:0,MID:11,FWD:0}}],temperature:1,assist_fraction:0,own_fraction:0,playerMatches:[],rho:-.08}}
assert.ok(adjustedRoleProbability(player(1,1,'MID',{role:1,confidence:'high'}))<=ROLE_CAP)
assert.ok(adjustedRoleProbability(player(1,1,'MID',{role:.9,confidence:'low',team_position_prior:.3}))<.7,'low confidence shrinks toward team-position prior')
{const d=normalizedDurationDistribution(player(1,1,'MID',{durations:[90,75],duration_weights:[.99,.01]}));const full=d.durations.reduce((s,x,i)=>s+(x>=90?d.weights[i]:0),0);assert.ok(full<=.9200001)}
{const out=simulateScout(baseInput(),2000,4242),dominant=out.find(p=>p.id===100);assert.ok(dominant.xi<1&&dominant.xi<=.97);assert.ok(dominant.minutes<=88);const noMatch=out.find(p=>p.id===999);assert.equal(noMatch.blank,true);assert.equal(noMatch.xfp,0)}
{const input=baseInput();input.matches.push({home_id:101,away_id:205,home_lambda:0,away_lambda:0});const out=simulateScout(input,200,11);assert.equal(out.find(x=>x.id===100).fixture_count,2)}
{const input=baseInput();input.matches[0].home_lambda=1.5;input.assist_fraction=1;input.own_fraction=1;const out=simulateScout(input,1000,1337),home=out.filter(p=>p.club===101),away=out.filter(p=>p.club===205);assert.equal(home.reduce((s,p)=>s+p.xgoal,0),0);assert.ok(home.reduce((s,p)=>s+p.xassist,0)>0);assert.ok(away.reduce((s,p)=>s+p.components.own,0)<0)}
{const b=allocateBonus([1,2,3,4],{1:10,2:10,3:8,4:7},{1:90,2:90,3:90,4:90},[3,2,1]);assert.deepEqual(b,{1:3,2:3,3:1})}
assert.ok(dixonColesTau(0,0,1.2,.9,-.08)>1)
{const a=redCardAdjustedLambdas(1.5,1,45,91);assert.ok(a.homeLambda<1.5&&a.awayLambda>1)}
assert.equal(cardPoints(true,false),-1);assert.equal(cardPoints(false,true),-3);assert.equal(cardPoints(true,true),-3)
console.log('simulateScout checks passed')
