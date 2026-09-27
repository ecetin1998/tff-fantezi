import {getPlayersWithProjection,getTeamFixturesOverview} from '@/lib/data'
import {SITE_URL} from '@/lib/config'

export const revalidate=3600

export default async function sitemap(){
  const site=SITE_URL
  const routes=['','/players','/points','/matches','/teams','/squads','/availability','/roles','/backtest','/pricing','/sss']
  const [playerData,teamData]=await Promise.all([getPlayersWithProjection(),getTeamFixturesOverview()])
  return [
    ...routes.map(path=>({url:site+path,changeFrequency:path===''?'daily':path==='/sss'?'monthly':'weekly',priority:path===''?1:path==='/sss' ? .85 : .8})),
    ...(playerData.players||[]).map(p=>({url:site+'/players/'+p.id,changeFrequency:'weekly',priority:.6})),
    ...(teamData.teams||[]).filter((t,i,a)=>a.findIndex(x=>Number(x.id)===Number(t.id))===i).map(t=>({url:site+'/teams/'+t.id,changeFrequency:'weekly',priority:.6}))
  ]
}
