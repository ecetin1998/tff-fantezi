import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/config'

export async function updateSession(request) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  await supabase.auth.getClaims()
  return response
}
