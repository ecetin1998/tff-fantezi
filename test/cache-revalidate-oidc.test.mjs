import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {verifyRevalidateGithubOidc} from '../lib/revalidateGithubOidc.js'

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const now=1792750000
const jwk={...publicKey.export({format:'jwk'}),kid:'action-key-1',alg:'RS256',use:'sig'}
const fetchJwks=async()=>({ok:true,json:async()=>({keys:[jwk]})})
const validClaims={
 iss:'https://token.actions.githubusercontent.com',
 aud:'tff-fantezi-scout',
 repository:'ecetin1998/tff-fantezi',
 repository_id:'1353738004',
 ref:'refs/heads/main',
 workflow_ref:'ecetin1998/tff-fantezi/.github/workflows/weekly-model-lifecycle.yml@refs/heads/main',
 event_name:'schedule',
 nbf:now-5,iat:now-5,exp:now+240
}
const jwt=(claims,header={alg:'RS256',kid:jwk.kid,typ:'JWT'})=>{
 const first=Buffer.from(JSON.stringify(header)).toString('base64url')
 const second=Buffer.from(JSON.stringify(claims)).toString('base64url')
 const body=first+'.'+second
 return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url')
}
const check=(t,opts={})=>verifyRevalidateGithubOidc(t,{fetchJwks,nowSec:now,...opts})
test('exact signed schedule workflow token is accepted',async()=>{
 assert.equal(await check(jwt(validClaims)),true)
})
test('signed availability workflow is accepted for push, schedule, and dispatch',async()=>{
 for(const event_name of ['push','schedule','workflow_dispatch']){
  const claims={...validClaims,event_name,
   workflow_ref:'ecetin1998/tff-fantezi/.github/workflows/availability-refresh.yml@refs/heads/main'}
  assert.equal(await check(jwt(claims)),true)
 }
})
test('unsigned, malformed, or modified JWT can never trigger public cache invalidation',async()=>{
 const signed=jwt(validClaims)
 assert.equal(await check('abc.def.ghi'),false)
 assert.equal(await check(''),false)
 assert.equal(await check(signed.split('.').slice(0,2).join('.')+'.invalid'),false)
 assert.equal(await check(jwt(validClaims,{alg:'none',kid:jwk.kid})),false)
 const parts=signed.split('.')
 const modified=Buffer.from(JSON.stringify({...validClaims,repository:'attacker/repo'})).toString('base64url')
 assert.equal(await check(parts[0]+'.'+modified+'.'+parts[2]),false)
})
test('claims from other repository, branch or workflow are refused',async()=>{
 for(const patch of [
  {iss:'https://invalid.example'},
  {aud:'another-audience'},
  {repository_id:'1'},
  {repository:'ecetin1998/other'},
  {ref:'refs/heads/dev'},
  {workflow_ref:'ecetin1998/tff-fantezi/.github/workflows/random.yml@refs/heads/main'},
  {workflow_ref:'ecetin1998/tff-fantezi/.github/workflows/weekly-model-lifecycle.yml@refs/heads/dev'},
  {event_name:'pull_request'},
  {exp:now-120},{nbf:now+150},{iat:now+150},{iat:now-1000}
 ]){
  assert.equal(await check(jwt({...validClaims,...patch})),false,JSON.stringify(patch))
 }
})
test('JWKS outages or unexpected key IDs fail closed',async()=>{
 assert.equal(await check(jwt(validClaims),{fetchJwks:async()=>({ok:false})}),false)
 assert.equal(await check(jwt(validClaims),{fetchJwks:async()=>({ok:true,json:async()=>({keys:[]})})}),false)
})
test('route and both GitHub workflows use signed token; legacy manual secret stays optional',()=>{
 const route=readFileSync(new URL('../app/api/revalidate/route.js',import.meta.url),'utf8')
 const weekly=readFileSync(new URL('../.github/workflows/weekly-model-lifecycle.yml',import.meta.url),'utf8')
 const availability=readFileSync(new URL('../.github/workflows/availability-refresh.yml',import.meta.url),'utf8')
 assert.match(route,/verifyRevalidateGithubOidc\(signedToken\)/)
 assert.match(route,/equalSecret\(expected,supplied\)/)
 assert.match(route,/status:401/)
 for(const wf of [weekly,availability]){
  assert.match(wf,/ACTIONS_ID_TOKEN_REQUEST_URL/)
  assert.match(wf,/audience=tff-fantezi-scout/)
  assert.match(wf,/Authorization: Bearer \$token/)
  assert.match(wf,/paths_revalidated >= 10/)
  assert.doesNotMatch(wf,/SCOUT_REVALIDATE_SECRET/)
 }
})
