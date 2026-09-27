import 'server-only'
import {captureException} from '@sentry/cloudflare'

export function reportServerError(scope,error,context={}){
  const message=String(error?.message||error||'Unknown error')
  const payload={level:'error',scope,message,code:error?.code||null,context,at:new Date().toISOString()}
  console.error(JSON.stringify(payload))

  if(!String(process.env.SENTRY_DSN||'').trim())return
  const exception=error instanceof Error?error:new Error(message)
  captureException(exception,{tags:{scope},extra:{...context,code:error?.code||null}})
}
