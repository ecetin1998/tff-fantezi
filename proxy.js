import {updateSession} from '@/lib/supabase/proxy'

export async function proxy(request){
  // Supabase SSR refreshes expiring access tokens and rotates the refresh cookie here.
  // Public static assets/data feeds stay outside this matcher.
  return updateSession(request)
}

export const config={
  matcher:['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/scout-data|api/player-search|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)']
}
