export default function robots(){
  const site=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.ecetin1998.workers.dev'
  return {rules:{userAgent:'*',allow:'/'},sitemap:site+'/sitemap.xml'}
}
