import 'server-only'
import * as Sentry from '@sentry/cloudflare'

let sentryInitialized=false

function ensureSentry(){
  const dsn=String(process.env.SENTRY_DSN||'').trim()
  if(!dsn)return false
  if(!sentryInitialized){
    Sentry.init({dsn,tracesSampleRate:0,sendDefaultPii:false})
    sentryInitialized=true
  }
  return true
}

export function reportServerError(scope,error,context={}){
  const message=String(error?.message||error||'Unknown error')
  const payload={level:'error',scope,message,code:error?.code||null,context,at:new Date().toISOString()}
  console.error(JSON.stringify(payload))
  if(!ensureSentry())return
  const exception=error instanceof Error?error:new Error(message)
  Sentry.captureException(exception,{tags:{scope},extra:{...context,code:error?.code||null}})
}
