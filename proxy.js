import {updateSession} from '@/lib/supabase/proxy'

export async function proxy(request){
  return updateSession(request)
}

export const config={
  matcher:[
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|icon|api/scout-data(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
