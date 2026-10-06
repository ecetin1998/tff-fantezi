import {getAuthState} from '@/lib/data'
export const dynamic='force-dynamic'
export async function GET(){const auth=await getAuthState();return Response.json({tier:auth.tier,plan:auth.plan,signedIn:auth.signedIn},{headers:{'Cache-Control':'private, no-store'}})}
