import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const refresh=read("supabase/functions/refresh-availability/index.ts");
const sql=read("supabase/migrations/20261118001500_verified_disciplinary_case_and_availability_audit.sql");
const data=read("supabase/migrations/20261118005000_mh12_availability_full_source_correction.sql");
const health=read("supabase/migrations/20261118003500_verified_health_news_mh12.sql");

test("all 456 players audited; official TFF verdict overrides stale third-party ban",()=>{
 assert.match(sql,/scout_availability_full_audit/);
 assert.match(sql,/security_invoker=true/);
 assert.match(sql,/affected_gameweeks/);
 assert.match(sql,/VALUES[\s\S]*533,17,9,2,ARRAY\[10,11\]/);
 assert.match(sql,/182,6,9,3,ARRAY\[10,11,12\]/);
 assert.match(sql,/600,5,10,3,ARRAY\[11,12,13\]/);
 assert.match(refresh,/from\("scout_verified_disciplinary_cases"\)/);
 assert.match(refresh,/tff_official_disciplinary_verdict/);
 assert.match(refresh,/tff_official_suspension_served/);
 assert.match(refresh,/verdictsByPlayer/);
 assert.match(refresh,/expiredBanCleared/);
 assert.match(refresh,/officialBanApplied/);
 assert.match(data,/MH12 availability row count changed/);
 assert.match(data,/Unresolved auto-audit discrepancies remain/);
});

test("second-source only injuries are risk review, not definite injury or healthy baseline",()=>{
 assert.match(refresh,/sourceOnlyRisks/);
 assert.match(refresh,/availability_type:"risk",availability_probability:0\.65/);
 assert.match(refresh,/availability_secondary_unconfirmed/);
 assert.match(data,/availability_type='risk', availability_probability=0\.65/);
 const loader=read("lib/data.js");
 const ui=read("lib/availability.js");
 assert.match(loader,/\['injuries','suspensions','risk'\]/);
 assert.match(ui,/availability_type==='risk'\)return 'Riskli'/);
});

test("severe two-source 60-day returns are not falsely 50% fit",()=>{
 assert.match(refresh,/longTermConfirmed/);
 assert.match(refresh,/longTermConfirmed\+\+/);
 assert.match(refresh,/60\*86400000/);
 assert.match(data,/a\.player_id IN\(95,222,339\)/);
 assert.match(health,/Can Bozdoğan/);
 assert.match(health,/Emre Kılınç/);
 assert.match(health,/Sonko Sundberg/);
 assert.match(health,/Wagner/);
 assert.match(health,/availability_probability=EXCLUDED.availability_probability/);
});

test("current run source audit changes remain reversible and never fake Monte Carlo",()=>{
 assert.match(data,/before_record jsonb NOT NULL/);
 assert.match(data,/after_record jsonb/);
 assert.match(data,/to_jsonb\(a\)/);
 assert.match(data,/scout_availability_bulk_audit_log/);
 assert.match(refresh,/const rebuildRequired=changed>0\|\|outOfSync>0/);
 assert.doesNotMatch(data,/UPDATE public\.scout_player_projections/i);
 assert.doesNotMatch(data,/UPDATE public\.scout_model_runs/i);
});
