import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {credibleAttackWeights as lifecycleWeights} from '../supabase/functions/weekly-model-lifecycle/defenderOpportunity.mjs';
import {validFinalWeeklyPlayerRow, acceptedFinalSource, MH11_INDEPENDENT_SOURCE} from '../supabase/functions/weekly-model-lifecycle/closureSource.mjs';

const require=createRequire(import.meta.url);
const {credibleAttackWeights:nodeWeights}=require('../model/attackAllocation.js');

function csvRows(){
  const lines=readFileSync('docs/mh11-provisional-fantasy-scores-20261109.csv','utf8').trim().split(/\r?\n/);
  const keys=lines.shift().split(',');
  assert.deepEqual(keys.slice(-3),['base_points','estimated_bonus','estimated_total']);
  return lines.map((line,index)=>{
    const vals=line.split(',');
    assert.equal(vals.length,keys.length,'Malformed CSV line '+(index+2));
    return Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
  });
}
function point(x,k){const n=Number(x[k]);assert.ok(Number.isFinite(n),'Bad '+k+' for '+x.player_id);return n;}

test('MH11 456 source event calculations balance by player, match and provisional tie tiers',()=>{
  const rows=csvRows(),ids=new Set(),groups=new Map();
  assert.equal(rows.length,456);
  let played=0,dnp=0,baseTotal=0,bonusTotal=0,pointsTotal=0;
  const goalPoints={GK:10,DEF:6,MID:5,FWD:4};
  for(const x of rows){
    assert.ok(!ids.has(x.player_id),'duplicate fantasy pool ID '+x.player_id);
    ids.add(x.player_id);
    const min=point(x,'minutes'),g=point(x,'goals'),ast=point(x,'assists_candidate');
    const y=point(x,'yellow_cards'),red=point(x,'red_cards'),og=point(x,'own_goals');
    const sav=point(x,'saves_candidate');
    assert.ok(min>=0&&min<=90&&Number.isInteger(min));
    assert.ok(['GK','DEF','MID','FWD'].includes(x.position));
    assert.equal(point(x,'minutes_points'),(min>0?1:0)+(min>60?1:0),'appearance '+x.player_id);
    assert.equal(point(x,'goal_points'),g*goalPoints[x.position],'goal '+x.player_id);
    assert.equal(point(x,'assist_points'),ast*3,'assist '+x.player_id);
    assert.equal(point(x,'save_points'),x.position==='GK'?Math.floor(sav/3):0,'GK save '+x.player_id);
    assert.equal(point(x,'card_og_points'),(red>0?-3:y>0?-1:0)-2*og,'cards and OG '+x.player_id);
    const sum=['minutes_points','goal_points','assist_points','clean_sheet_points','conceded_points','save_points','card_og_points'].reduce((s,k)=>s+point(x,k),0);
    assert.equal(sum,point(x,'base_points'),'base sum '+x.player_id);
    assert.equal(sum+point(x,'estimated_bonus'),point(x,'estimated_total'),'total '+x.player_id);
    const gg=groups.get(x.match_id)||[];gg.push(x);groups.set(x.match_id,gg);
    if(min>0)played++;else {
      dnp++;
      for(const field of ['base_points','estimated_bonus','estimated_total'])
        assert.equal(point(x,field),0,'DNP must not gain points');
    }
    baseTotal+=sum;bonusTotal+=point(x,'estimated_bonus');pointsTotal+=point(x,'estimated_total');
  }
  assert.equal(groups.size,9);
  for(const [match,group] of groups){
    assert.ok(group.filter(x=>point(x,'minutes')>0).length>=22,'missing one XI '+match);
    const rank=group.filter(x=>point(x,'minutes')>0)
      .sort((a,b)=>point(b,'base_points')-point(a,'base_points'));
    let tier=-1,previous=null,awarded=0;
    const expected=new Map();
    for(const x of rank){
      const value=point(x,'base_points');
      if(value!==previous){if(awarded>=3)break;tier++;previous=value;}
      if(tier>=3)break;
      expected.set(x.player_id,3-tier);awarded++;
    }
    for(const x of group)
      assert.equal(point(x,'estimated_bonus'),expected.get(x.player_id)||0,'provisional tied tier '+match+'/'+x.player_id);
  }
  assert.equal(played,278);assert.equal(dnp,178);
  assert.deepEqual([baseTotal,bonusTotal,pointsTotal],[713,79,792]);
});

test('MH11 independent final source is season/week-scoped and is not an official fantasy import',()=>{
  assert.equal(acceptedFinalSource(11,MH11_INDEPENDENT_SOURCE),true);
  assert.equal(acceptedFinalSource(12,MH11_INDEPENDENT_SOURCE),false);
  const candidate={player_id:71,match_id:317874,minutes:90,base_points:5,bonus_points:0,points:5,is_final:true,source_kind:MH11_INDEPENDENT_SOURCE};
  assert.equal(validFinalWeeklyPlayerRow(11,candidate),true);
  assert.equal(validFinalWeeklyPlayerRow(11,{...candidate,is_final:false}),false);
  assert.equal(validFinalWeeklyPlayerRow(11,{...candidate,minutes:0}),false);
  // The CSV and this test are source-event calculations; neither sets is_final in the database.
  assert.match(readFileSync('docs/mh11-provisional-score-audit-20261109.md','utf8'),/Resmî TFF Fantezi puan dökümü değildir/);
});

test('non-DEF weights prefer verified expected chances, not short goal/assist finishing streaks',()=>{
  const rates=[.25,1.0,.5,.12,0,0,0,0,0,0,0,0,-1,-1];
  const a=nodeWeights('MID','W',rates),b=lifecycleWeights('MID','W',rates);
  assert.equal(a.goal,.82*.25+.18*1);
  assert.equal(a.assist,.82*.12+.18*.5);
  assert.equal(a.goal,b.goal);
  assert.equal(a.assist,b.assist);
  assert.ok(a.goal<.75*.25+.25*1,'goal streak should shrink');
  assert.ok(a.assist<.70*.12+.30*.5,'assist streak should shrink');
  const def=nodeWeights('DEF','CB',[.04,.02,.01,.02,0,0,0,0,0,0,0,0,-1,-1]);
  assert.equal(def.goal,.90*.04+.10*.02,'DEF role-specific source-credibility policy remains intact');
  const oldMarker=nodeWeights('FWD','ST',[.3,.2,.1,.08,0,0,0,0,0,0,0,0,-1,-1]);
  const activeFeedback=nodeWeights('FWD','ST',[.3,.2,.1,.08,0,0,0,0,0,0,0,0,-1,-1,.65]);
  assert.equal(activeFeedback.goal/oldMarker.goal,.65,'explicit legacy FWD marker stays scoped');
});
test('edge/Actions score policies and formulas must match',()=>{
  const edge=readFileSync('supabase/functions/run-live-sim-chunk/index.ts','utf8');
  const wf=readFileSync('.github/workflows/weekly-model-lifecycle.yml','utf8');
  assert.match(edge,/\.82\*xg\+\.18\*goals/);
  assert.match(edge,/\.82\*xa\+\.18\*assists/);
  assert.match(edge,/gk-sot-source-age-decay-v5-starter-duration-sparse-exposure/);
  assert.equal((wf.match(/gk-sot-source-age-decay-v5-starter-duration-sparse-exposure/g)||[]).length,6);
  assert.doesNotMatch(wf,/gk-sot-source-age-decay-v3/,'new scorer must deploy before 50K can run');
});
