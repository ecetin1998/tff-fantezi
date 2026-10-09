import {getAuthState,getCurrentRun,getProOverlayForRun} from '@/lib/data'

export const dynamic='force-dynamic'

const privateHeaders={'Cache-Control':'private, no-store'}

export async function GET(){
  try{
    const auth=await getAuthState()
    if(auth.plan!=='pro')return Response.json({error:'PRO_REQUIRED'},{status:403,headers:privateHeaders})
    const run=await getCurrentRun()
    const rows=run?await getProOverlayForRun(run.id):[]
    return Response.json({run_id:run?.id||null,rows},{headers:privateHeaders})
  }catch(error){
    const code=error?.code||'OVERLAY_UNAVAILABLE'
    console.error('pro-player-overlay failed',{code,message:error?.message||'Unknown error'})
    return Response.json({error:code==='42501'?'PRO_ACCESS_MISMATCH':'OVERLAY_UNAVAILABLE'},{status:code==='42501'?403:503,headers:privateHeaders})
  }
}
