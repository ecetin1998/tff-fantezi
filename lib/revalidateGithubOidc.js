// GitHub Actions OpenID Connect verification for public /api/revalidate.
// No shared static credential is needed: only these signed, short-lived
// tokens from the two production workflows are authorized.
const GH_ISSUER='https://token.actions.githubusercontent.com'
const GH_JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks'
const AUDIENCE='tff-fantezi-scout'
const REPO='ecetin1998/tff-fantezi'
const REPO_ID='1353738004'
// Bind event permissions to the actual production workflow, not only the repo.
const WORKFLOW_EVENTS=new Map([
  [REPO+'/.github/workflows/weekly-model-lifecycle.yml@refs/heads/main',
    new Set(['schedule','workflow_dispatch','push'])],
  [REPO+'/.github/workflows/availability-refresh.yml@refs/heads/main',
    new Set(['schedule','workflow_dispatch'])],
])

function decode(part){
  if(!/^[A-Za-z0-9_-]+$/.test(part))throw new Error('bad_encoding')
  return JSON.parse(Buffer.from(part,'base64url').toString('utf8'))
}

export async function verifyRevalidateGithubOidc(token,{
  fetchJwks=fetch,nowSec=Math.floor(Date.now()/1000)
}={}){
  try{
    if(typeof token!=='string'||token.length>12000)return false
    const parts=token.split('.')
    if(parts.length!==3)return false
    const header=decode(parts[0]),claims=decode(parts[1])
    if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)return false
    if(claims.iss!==GH_ISSUER||claims.aud!==AUDIENCE||
      claims.repository!==REPO||String(claims.repository_id)!==REPO_ID||
      claims.ref!=='refs/heads/main'||
      !WORKFLOW_EVENTS.get(claims.workflow_ref)?.has(claims.event_name))return false
    const {exp,nbf,iat}=claims
    // Expired or not-yet-valid credentials must never invalidate public pages.
    // Reject coerced timestamps and implausibly long-lived signed credentials.
    if(!Number.isSafeInteger(exp)||!Number.isSafeInteger(nbf)||
      !Number.isSafeInteger(iat)||exp<=nowSec||exp>nowSec+600||
      nbf>nowSec||iat>nowSec+30||iat<nowSec-600||
      exp<=iat||exp-iat>600||nbf>=exp)return false
    const response=await fetchJwks(GH_JWKS_URL)
    if(!response.ok)return false
    const body=await response.json()
    const jwk=(body.keys||[]).find(key=>
      key.kid===header.kid&&key.kty==='RSA'&&
      (!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig'))
    if(!jwk)return false
    const key=await crypto.subtle.importKey('jwk',jwk,
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,
      Buffer.from(parts[2],'base64url'),
      new TextEncoder().encode(parts[0]+'.'+parts[1]))
  }catch{
    return false
  }
}
