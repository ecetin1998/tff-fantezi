const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'},
  {key:'Content-Security-Policy',value:"base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"},
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers(){
    return [{source:'/:path*',headers:securityHeaders}]
  }
}
export default nextConfig
