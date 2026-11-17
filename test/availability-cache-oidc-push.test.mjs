import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyRevalidateGithubOidc} from "../lib/revalidateGithubOidc.js";
const s=readFileSync(new URL("../lib/revalidateGithubOidc.js",import.meta.url),"utf8");
test("only trusted availability workflow from main accepts push cache invalidation",()=>{
 assert.match(s, /availability-refresh\.yml@refs\/heads\/main',\s*new Set\(\['schedule','workflow_dispatch','push'\]\)/);
 assert.match(s, /claims\.ref!=='refs\/heads\/main'/);
 assert.match(s, /!WORKFLOW_EVENTS\.get\(claims\.workflow_ref\)\?\.has\(claims\.event_name\)/);
 assert.match(s, /claims\.repository!==REPO/);
 assert.match(s, /claims\.repository_id\)!==REPO_ID/);
 assert.match(s, /crypto\.subtle\.verify/);
});
test("a garbage JWT, wrong size or unknown payload is still rejected",async()=>{
 for(const token of ["bad","a.b.c",null,"x".repeat(12001)]){
  assert.equal(await verifyRevalidateGithubOidc(token),false);
 }
});
