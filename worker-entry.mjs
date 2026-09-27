import worker from './.open-next/worker.js' // eslint-disable-line import/no-unresolved
import {withSentry} from '@sentry/cloudflare'

export default withSentry((env)=>{
  const dsn=String(env?.SENTRY_DSN||'').trim()
  if(!dsn)return undefined
  return {
    dsn,
    tracesSampleRate:0,
    sendDefaultPii:false,
  }
},worker)
