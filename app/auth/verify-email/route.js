import {NextResponse} from 'next/server'
import {createClient as createAdminClient} from '@supabase/supabase-js'
import {createClient} from '@/lib/supabase/server'
import {SUPABASE_URL} from '@/lib/config'

export async function GET(request){
  const url=new URL(request.url)
  const redirect=(status)=>NextResponse.redirect(new URL('/profile?verification='+status,url.origin))
  const supabase=await createClient()
  const code=url.searchParams.get('code')
  const token_hash=url.searchParams.get('token_hash')
  const type=url.searchParams.get('type')
  if(!code && !(token_hash && ['email','magiclink'].includes(type)))return redirect('invalid')
  const result=code
    ?await supabase.auth.exchangeCodeForSession(code)
    :await supabase.auth.verifyOtp({type,token_hash})
  if(result.error)return redirect('invalid')
  const {data:{user},error}=await supabase.auth.getUser()
  if(error||!user?.id||!user?.email)return redirect('invalid')
  // This key is server-only. Without it, do not mark any address verified.
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!serviceKey)return redirect('configuration')
  const admin=createAdminClient(SUPABASE_URL,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const {error:writeError}=await admin.from('scout_email_verifications')
    .upsert({user_id:user.id,email:user.email,verified_at:new Date().toISOString()},{onConflict:'user_id'})
  if(writeError)return redirect('save_failed')
  // Activate a reserved launch slot after mailbox ownership is proven.
  const {error:claimError}=await supabase.rpc('scout_claim_launch_pro')
  if(claimError)console.error('Launch Pro claim failed after verification:',claimError.code)
  return redirect('success')
}
