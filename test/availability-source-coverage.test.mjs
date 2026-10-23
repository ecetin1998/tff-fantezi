import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAvailabilityCoverage,crossTeamIdentitySupported} from '../supabase/functions/refresh-availability/coverage.mjs';

const mismatch=(source_player,scoreInactive,scoreActive=.3,other=.2)=>({
  source_team:'Kasımpaşa',source_player,team_id:3,reason_unmatched:'player',
  best:{name:'not matched',score:scoreActive},
  inactive_best:{name:source_player,score:scoreInactive},
  active_elsewhere_best:{score:other}
});

test('Oct 23: inactive fantasy players and one unlisted entry do not break 46/54 source matches',()=>{
 const inactive=['Jayden Oosterwolde','Amara Diouf','Peter Etebo','Ibrahim Sabra',
  'Mortadha Ben Ouanes','Fousseni Diabaté','Godfried Frimpong']
  .map(n=>mismatch(n,1));
 const unlisted=mismatch('Muhammed Hasan Yıldırım',.15,.435,.3);
 const policy=assessAvailabilityCoverage({parsedCount:54,matchedCount:46,unmatched:[...inactive,unlisted]});
 assert.equal(policy.accepted,true);
 assert.equal(policy.skippedInactive,7);
 assert.equal(policy.skippedUnlisted,1);
 assert.equal(policy.critical.length,0);
 assert.equal(policy.coverage,46/54);
});

test('actual active-player alias or team transfer remains visible and reviewable',()=>{
 const active=mismatch('renamed player',0,.68);
 const p=assessAvailabilityCoverage({parsedCount:45,matchedCount:44,unmatched:[active]});
 assert.equal(p.ignored.length,0);
 assert.equal(p.critical.length,1);
 assert.equal(p.critical[0].review_reason,'possible_active_player_alias');
});

test('transfer of an active player cannot be silently excluded as off-roster',()=>{
 const other=mismatch('new-team-player',0,.1,.9);
 const p=assessAvailabilityCoverage({parsedCount:42,matchedCount:41,unmatched:[other]});
 assert.equal(p.accepted,false);
 assert.equal(p.critical[0].review_reason,'active_player_team_drift');
});

test('failed parser coverage and high unmatched volume still abort with unchanged availability',()=>{
 const many=Array.from({length:8},(_,i)=>mismatch('ambiguous-'+i,0,.64));
 assert.equal(assessAvailabilityCoverage({parsedCount:54,matchedCount:46,unmatched:many}).accepted,false);
 const tooManyUnknown=Array.from({length:5},(_,i)=>mismatch('new-'+i,0,.1));
 assert.equal(assessAvailabilityCoverage({parsedCount:54,matchedCount:49,unmatched:tooManyUnknown}).accepted,false);
 assert.equal(assessAvailabilityCoverage({parsedCount:60,matchedCount:30,unmatched:[]}).accepted,false);
 assert.equal(assessAvailabilityCoverage({parsedCount:12,matchedCount:12,unmatched:[]}).accepted,false);
});

test('availability source refuses to turn ambiguous previously injured active players into healthy baselines',()=>{
 const source=readFileSync(new URL('../supabase/functions/refresh-availability/index.ts',import.meta.url),'utf8');
 assert.match(source,/assessAvailabilityCoverage/);
 assert.match(source,/coverage\.accepted/);
 assert.match(source,/coverage\.critical/);
 assert.match(source,/uncertainTeams/);
 assert.match(source,/scout_availability/);
 assert.match(source,/source_ignored_inactive/);
});

test('cross-team identities never match by one common first name or surname',()=>{
 assert.equal(crossTeamIdentitySupported('Ibrahim Sabra','İbrahim Kaya'),false);
 assert.equal(crossTeamIdentitySupported('Fousseni Diabaté','Ousmane Diabate'),false);
 assert.equal(crossTeamIdentitySupported('Muhammed Hasan Yıldırım','Muhammed Şengezer'),false);
 assert.equal(crossTeamIdentitySupported('Jayden Oosterwolde','Jayden Quinn Oosterwolde'),true);
 assert.equal(crossTeamIdentitySupported('Fousseni Diabaté','Fousseni Diabaté'),true);
 assert.equal(crossTeamIdentitySupported('Youssouf Fofana',''],false);
});
