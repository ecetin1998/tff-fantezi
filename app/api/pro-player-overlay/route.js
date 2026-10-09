import {randomUUID} from 'node:crypto'
import {getAuthState,getCurrentRun,getProOverlayForRun} from '@/lib/data'

export const dynamic='force-dynamic'

const privateHeaders={'Cache-Control':'private, no-store'}

export async function GET(request){
  const requestId=randomUUID()
  const started=Date.now()
  let stage='auth'
  try{
    const auth=await getAuthState()
    if(auth.plan!=='pro'){
      console.warn('pro-player-overlay denied',{requestId,stage,reason:'plan_not_pro',signedIn:auth.signedIn})
      return Response.json({error:'PRO_REQUIRED',request_id:requestId},{status:403,headers:privateHeaders})
    }
    stage='current_run'
    const requestedRun=request.nextUrl.searchParams.get('run_id')
    if(requestedRun&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedRun)){
      return Response.json({error:'INVALID_RUN_ID',request_id:requestId},{status:400,headers:privateHeaders})
    }
    const run=requestedRun?{id:requestedRun}:await getCurrentRun()
    stage='pro_rpc'
    const rows=run?await getProOverlayForRun(run.id):[]
    console.info('pro-player-overlay completed',{requestId,elapsedMs:Date.now()-started,rowCount:rows.length,hasRun:Boolean(run)})
    return Response.json({run_id:run?.id||null,rows},{headers:privateHeaders})
  }catch(error){
    const code=String(error?.code||'OVERLAY_UNAVAILABLE')
    const accessMismatch=code==='42501'
    console.error('pro-player-overlay failed',{requestId,stage,code,elapsedMs:Date.now()-started,message:String(error?.message||'Unknown error').slice(0,300)})
    return Response.json({error:accessMismatch?'PRO_ACCESS_MISMATCH':'OVERLAY_UNAVAILABLE',request_id:requestId},{status:accessMismatch?403:503,headers:privateHeaders})
  }
}
