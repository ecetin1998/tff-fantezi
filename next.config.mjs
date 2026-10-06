/** @type {import('next').NextConfig} */
const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains; preload'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Content-Security-Policy',value:[
    "default-src 'self'","base-uri 'self'","frame-ancestors 'none'","object-src 'none'","form-action 'self'",
    "img-src 'self' data: blob: https:","font-src 'self' data:","style-src 'self' 'unsafe-inline'","script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io"
  ].join('; ')}
]
const publicEdgeCacheHeaders=[{key:'Cloudflare-CDN-Cache-Control',value:'public, max-age=300, stale-while-revalidate=600'}]
const privateEdgeCacheHeaders=[{key:'Cloudflare-CDN-Cache-Control',value:'private, no-store'}]
const publicEdgeRoutes=['/teams','/points','/sss']
const privateEdgeRoutes=[
  '/','/players','/matches','/squads','/availability','/players/:id','/teams/:id','/roles','/roles/:path*','/backtest','/squad','/squad/:path*',
  '/pricing','/pricing/:path*','/login','/login/:path*','/reset-password','/reset-password/:path*',
  '/confirm-email','/confirm-email/:path*','/auth/:path*','/api/health','/api/scout-data/summary'
]
const nextConfig={reactStrictMode:true,poweredByHeader:false,async headers(){return [
  {source:'/:path*',headers:securityHeaders},
  ...publicEdgeRoutes.map(source=>({source,headers:publicEdgeCacheHeaders})),
  ...privateEdgeRoutes.map(source=>({source,headers:privateEdgeCacheHeaders})),
]}}
export default nextConfig
