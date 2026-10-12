import {revalidatePath,revalidateTag} from 'next/cache'
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
  // A model promotion changes both the run-scoped Data Cache and rendered
  // Next/Cloudflare ISR HTML. Invalidating only the tag previously left the
  // live homepage / public pages displaying MH7 while the JSON API served MH8.
  const paths=['/','/players','/matches','/squads','/squad','/availability','/roles','/points','/teams','/backtest','/model-health']
  for(const path of paths)revalidatePath(path)
  revalidatePath('/players/[id]','page')
  revalidatePath('/teams/[id]','page')
  return Response.json({ok:true,tag:'scout-run',paths_revalidated:paths.length+2})
}
