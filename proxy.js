import {updateSession} from '@/lib/supabase/proxy'

export async function proxy(request){
  // Supabase SSR refreshes expiring access tokens and rotates the refresh cookie here.
  // Public static assets/data feeds stay outside this matcher.
  return updateSession(request)
}

export const config={
  matcher:['/squad/:path*','/roles/:path*','/players/:id','/teams/:id','/api/access','/api/pro-player-overlay']
}
