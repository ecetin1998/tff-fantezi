import 'server-only'

export function reportServerError(scope,error,context={}){
  const message=String(error?.message||error||'Unknown error')
  const payload={
    level:'error',
    scope,
    message,
    code:error?.code||null,
    context,
    at:new Date().toISOString(),
  }
  console.error(JSON.stringify(payload))
}
