export default function robots(){
  const site=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.vercel.app'
  return {rules:{userAgent:'*',allow:'/'},sitemap:site+'/sitemap.xml',host:site}
}
