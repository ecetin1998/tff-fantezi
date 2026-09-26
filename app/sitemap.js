export default function sitemap(){
  const site=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.vercel.app'
  const routes=['','/players','/points','/matches','/teams','/squads','/availability','/roles','/backtest','/pricing']
  return routes.map(path=>({url:site+path,changeFrequency:path===''?'daily':'weekly',priority:path===''?1:.8}))
}
