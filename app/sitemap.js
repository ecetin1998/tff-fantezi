import {getPlayersWithProjection,getTeamFixturesOverview} from '@/lib/data'

export const revalidate=3600

export default async function sitemap(){
  const site=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.vercel.app'
  const routes=['','/players','/points','/matches','/teams','/squads','/availability','/roles','/backtest','/pricing']
  const [playerData,teamData]=await Promise.all([getPlayersWithProjection(),getTeamFixturesOverview()])
  return [
    ...routes.map(path=>({url:site+path,changeFrequency:path===''?'daily':'weekly',priority:path===''?1:.8})),
    ...(playerData.players||[]).map(p=>({url:site+'/players/'+p.id,changeFrequency:'weekly',priority:.6})),
    ...(teamData.teams||[]).filter((t,i,a)=>a.findIndex(x=>Number(x.id)===Number(t.id))===i).map(t=>({url:site+'/teams/'+t.id,changeFrequency:'weekly',priority:.6}))
  ]
}
