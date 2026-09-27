export function shouldUsePublicPayloadCache(full){
  return !full
}

export function responseHeadersFor(base,{status=200,privateResponse=false,varyApiKey=false}={}){
  const noStore=status>=400||privateResponse
  const headers=noStore?{
    ...base,
    'Cache-Control':'private, no-store',
    'CDN-Cache-Control':'no-store',
    'Vercel-CDN-Cache-Control':'no-store',
  }:{...base}
  if(varyApiKey)headers.Vary='x-api-key'
  return headers
}
