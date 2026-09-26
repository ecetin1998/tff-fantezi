import {createClient} from '@supabase/supabase-js'
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '@/lib/config'

let publicClient

export function createPublicClient(){
  if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY) throw new Error('Public Supabase environment is not configured')
  if(!publicClient){
    publicClient=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    })
  }
  return publicClient
}
