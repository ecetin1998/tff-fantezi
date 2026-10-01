import {updateSession} from '@/lib/supabase/proxy'

export async function middleware(request){
  return updateSession(request)
}

export const config={
  matcher:[
    '/squad/:path*',
    '/login/:path*',
    '/signup/:path*',
    '/forgot-password/:path*',
    '/reset-password/:path*',
    '/confirm-email/:path*',
    '/auth/:path*',
    '/pricing/:path*',
    '/profile/:path*',
  ],
}
