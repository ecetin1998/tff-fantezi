export function reportServerError(scope,error,context={}){
  const payload={
    level:'error',
    scope,
    message:String(error?.message||error||'Unknown error'),
    code:error?.code||null,
    context,
    at:new Date().toISOString(),
  }
  console.error(JSON.stringify(payload))
}
