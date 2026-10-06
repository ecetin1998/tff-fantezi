import {revalidateTag} from 'next/cache'
import {timingSafeEqual} from 'node:crypto'

export const dynamic='force-dynamic'

function equalSecret(expected,supplied){
  if(!expected||expected.length<24)return false
  const a=Buffer.from(expected),b=Buffer.from(supplied||'')
  return a.length===b.length&&timingSafeEqual(a,b)
}

export async function POST(request){
  const expected=String(process.env.SCOUT_REVALIDATE_SECRET||'')
  const supplied=String(request.headers.get('x-revalidate-secret')||'')
  if(!equalSecret(expected,supplied))return Response.json({ok:false},{status:401})
  revalidateTag('scout-run','max')
  return Response.json({ok:true,tag:'scout-run'})
}
