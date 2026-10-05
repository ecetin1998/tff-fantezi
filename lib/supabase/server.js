import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/config'

const claimsVerifier=createSupabaseClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
})

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })
}


export async function getVerifiedClaims(supabase){
  const {data:{session},error:sessionError}=await supabase.auth.getSession()
  if(sessionError)return {data:null,error:sessionError}
  const accessToken=session?.access_token||null
  if(!accessToken)return {data:{claims:null},error:null}
  return claimsVerifier.auth.getClaims(accessToken)
}
