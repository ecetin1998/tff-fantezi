import {NextResponse} from 'next/server'

export function proxy(){
  // Authenticated pages/actions resolve Supabase cookies server-side. Keeping the
  // global proxy edge-safe avoids OpenNext's experimental Node middleware bundle.
  return NextResponse.next()
}

export const config={
  matcher:['/squad/:path*','/roles/:path*','/api/access','/api/pro-player-overlay']
}
