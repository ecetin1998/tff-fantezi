const assert=require('node:assert/strict');
const fs=require('node:fs');
const {simulateScout,bonusByCompetitionRank,appearancePoints}=require('./simulateScout');
const {normalizedDefenderRole,singleShotCap,attackWeights}=require('./attackAllocation');

(async()=>{
  const {firstRecordedRate,observedPer90}=await import('../supabase/functions/weekly-model-lifecycle/externalRole.mjs');
  assert.equal(firstRecordedRate(null,undefined,.25),.25,'source-missing xA falls back to model');
  assert.equal(firstRecordedRate(0,.25),0,'real observed zero cannot be rewritten');
  assert.equal(firstRecordedRate('','.17'),.17,'empty upstream xA must be treated as missing');
  assert.equal(observedPer90(null,540,.15),.15,'missing season total with recorded minutes uses sourced prior');
  assert.equal(observedPer90(0,540,.15),0,'recorded season zero remains zero');
  assert.equal(observedPer90(2,180,.15),1,'per90 observation arithmetic is exact');
  assert.equal(appearancePoints(60),1);
  assert.equal(appearancePoints(61),2);

  for(const [label,p,cap] of [
    ['CB',{pos:'DEF',sub_role:'CB'},.22],
    ['FB',{pos:'DEF',sub_role:'RB'},.32],
    ['WB',{pos:'DEF',sub_role:'LWB'},.36],
    ['MID',{pos:'MID',sub_role:'DM'},.33],
    ['FWD',{pos:'FWD',sub_role:'ST'},.42],
  ]){
    assert.equal(singleShotCap(p),cap,label+' per-shot role allowance');
  }
  const cbShot={id:1,pos:'DEF',sub_role:'CB',rates:[.13,.03,.02,.03]};
  const wbShot={...cbShot,sub_role:'WB'};
  const isolated=[{id:1,mins:90,shots:1,xg:.55}];
  assert(attackWeights(cbShot,isolated).goal<attackWeights(wbShot,isolated).goal,
    'an isolated large shot gets stronger shrinkage for CB than wing-back');
  const noHistory=attackWeights(cbShot,[]);
  assert(noHistory.goal>0,'ordinary CB set-piece threat with sourced rates remains possible');

  function team(club){
    const specs=[
      ['GK','GK',[0,0,0,0]],['DEF','CB',[.03,.015,.012,.01]],
      ['DEF','FB',[.09,.05,.07,.11]],['DEF','WB',[.12,.06,.09,.15]],
      ['DEF','CB',[.04,.02,.02,.01]],
      ['MID','DM',[.025,.015,.025,.025]],['MID','CM',[.05,.03,.05,.07]],
      ['MID','AM',[.13,.07,.12,.19]],['MID','W',[.20,.10,.10,.14]],
      ['MID','DM',[.015,.01,.01,.015]],['FWD','ST',[.43,.27,.05,.065]],
    ];
    return specs.map(([pos,sub_role,rates],i)=>({
      id:club*100+i+1,club,pos,sub_role,
      rates:[...rates,0,0,3,0,0,0,0,0],
      durations:[90],duration_weights:[1],avail:1,role:.99,benchw:1,
    }));
  }
  const input={
    players:[...team(1),...team(2)],
    matches:[{match_id:1,home_id:1,away_id:2,home_lambda:1.7,away_lambda:0}],
    team_checks:[{club:1,formation:{GK:1,DEF:4,MID:5,FWD:1}},
                 {club:2,formation:{GK:1,DEF:4,MID:5,FWD:1}}],
    temperature:1,assist_fraction:.7,own_fraction:0,playerMatches:[],
  };
  const out=simulateScout(input,6000,10152026);
  const a=out.filter(p=>p.club===1);
  const pos=(pos,sub)=>a.find(p=>p.pos===pos&&p.sub_role===sub);
  const gk=pos('GK','GK'),cb=pos('DEF','CB'),fb=pos('DEF','FB'),wb=pos('DEF','WB'),
        dm=pos('MID','DM'),am=pos('MID','AM'),st=pos('FWD','ST');
  assert(st.xgoal>am.xgoal&&am.xgoal>dm.xgoal,'ST, attacking MID, DM receive role-shaped goals');
  assert(wb.xgoal>cb.xgoal&&fb.xgoal>cb.xgoal,'FB/WB legitimate attacking involvement exceeds CB');
  assert(wb.xassist>cb.xassist&&am.xassist>dm.xassist,
    'creative defenders and AM receive creator xA shares, never artificial goal bonuses');
  assert(Math.abs(a.reduce((s,p)=>s+p.xgoal,0)-1.7)<.09,
    'players allocated exactly the team match xG across shared scenario draws');
  assert(Math.abs(a.reduce((s,p)=>s+p.xassist,0)-1.19)<.09,
    'assists allocated consistently with attacking events');
  assert.equal(gk.components.cs,4);
  assert.equal(cb.components.cs,4);
  assert.equal(am.components.cs,1);
  assert.equal(st.components.cs,0);
  for(const p of out){
    const sum=Object.values(p.components).reduce((a,b)=>a+b,0)+p.bonus;
    assert(Math.abs(sum-p.xfp)<.001,'role points must be official components only: '+p.id);
  }
  const tied=bonusByCompetitionRank([0,1,2],{0:6,1:6,2:5},[90,90,90]);
  assert.deepEqual([tied[0],tied[1],tied[2]],[3,3,2],
    'equal DEF clean sheet and MID assist scores get identical tier bonus');
  const lifecycle=fs.readFileSync('supabase/functions/weekly-model-lifecycle/index.ts','utf8');
  assert.match(lifecycle,/firstRecordedRate\(s\.xa_per90,s\.xa_model_per90,prior\.effective_xa_per90,priorRates\[3\]\)/,
    'weekly rollover must not discard sourced xA model when observed xA is null');
  assert.match(lifecycle,/rates\[3\]=firstRecordedRate\(stats\.xa_per90,stats\.xa_model_per90,rates\[3\]\)/,
    'same-week 50K refresh must fix xA inputs, not just next-week preparation');
  assert.match(lifecycle,/team_assist_share:\(\(\)=>\{/,
    'refresh must recompute role assist share after updating xA inputs');
  const edge=fs.readFileSync('supabase/functions/run-live-sim-chunk/index.ts','utf8');
  assert.match(edge,/const score=\[teamGoals\(match\.home_lambda\),teamGoals\(match\.away_lambda\)\]/);
  assert.match(edge,/SCORING\.goal\[P\[scorer\]\.pos\]/);
  assert.match(edge,/SCORING\.clean_sheet\[p\.pos\]/);
  assert.match(edge,/SCORING\.conceded_per_2\[p\.pos\]/);
  assert.match(edge,/\.gte\("through_gameweek",Math\.max\(1,GAMEWEEK-2\)\)/,
    'current scorer must not silently forget a single-shot adjustment if MH7 is missing');
  assert.match(edge,/const freshness=age===0\?1:age===1\?\.5:0/,
    'one-week-old evidence gets a clear discount and older evidence is rejected');

  console.log('All-position roles, sourced rates, on-pitch conflicts, scoring and fixture xG contracts PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
