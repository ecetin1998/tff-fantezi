import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("both production lifecycle 50K paths stay CPU-safe and exact",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/weekly-model-lifecycle.yml",import.meta.url),"utf8");
 const count=pattern=>(workflow.match(pattern)||[]).length;
 assert.equal(count(/for part in \$\(seq 0 99\)/g),2,"both live current and week-transition 50K paths");
 assert.equal(count(/part \* 500 \+ 1/g),2,"seeds must stay nonoverlapping");
 assert.equal(count(/draws=500&seed=\$seed/g),2);
 assert.equal(count(/draws=2000&seed=\$seed/g),0);
 assert.equal(100*500,50000);
 assert.equal(count(/mode=finalize&gw=\$GAMEWEEK/g),2,"finalize rejects <50000");
 assert.equal(count(/gk-sot-source-blend-v2/g),6);
});
