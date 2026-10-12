// Public read-only production check. Does not need privileged OIDC event claims.
// Supabase publishable key is intended for public data; RLS controls visibility.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../lib/config.js'

const endpoint=new URL('/rest/v1/scout_model_runs',SUPABASE_URL)
endpoint.searchParams.set('select','id,gameweek,status,is_current')
endpoint.searchParams.set('is_current','eq.true')
const response=await fetch(endpoint,{
  headers:{
    apikey:SUPABASE_PUBLISHABLE_KEY,
    Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,
    Accept:'application/json'
  },
  signal:AbortSignal.timeout(20000)
})
if(!response.ok)throw new Error('Public Supabase current-run query failed: HTTP '+response.status)
const rows=await response.json()
if(!Array.isArray(rows)||rows.length!==1||rows[0].status!=='ready'
  ||rows[0].is_current!==true||!Number.isInteger(Number(rows[0].gameweek))
  ||Number(rows[0].gameweek)<1){
  throw new Error('Expected exactly one ready current model run')
}
process.stdout.write(String(rows[0].gameweek)+'\n')
