import {getAuthState,getCurrentRun,getProOverlayForRun} from '@/lib/data'
export const dynamic='force-dynamic'
export async function GET(){const auth=await getAuthState();if(auth.plan!=='pro')return Response.json({error:'PRO_REQUIRED'},{status:403,headers:{'Cache-Control':'private, no-store'}});const run=await getCurrentRun();const rows=run?await getProOverlayForRun(run.id):[];return Response.json({run_id:run?.id||null,rows},{headers:{'Cache-Control':'private, no-store'}})}
