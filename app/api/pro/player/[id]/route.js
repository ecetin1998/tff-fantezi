import {getAuthState,getPlayerDetail} from '@/lib/data'
import {reportServerError} from '@/lib/observability'

export const dynamic='force-dynamic'

const headers={
  'Cache-Control':'private, no-store',
  'CDN-Cache-Control':'no-store',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
}

export async function GET(_request,{params}){
  try{
    const auth=await getAuthState()
    if(auth.plan!=='pro')return Response.json({error:'Pro üyelik gerekli.'},{status:403,headers})
    const {id}=await params
    const data=await getPlayerDetail(id)
    if(!data)return Response.json({error:'Oyuncu bulunamadı.'},{status:404,headers})
    const {projection:p,role:r,season:s,modelFeatures:mf}=data
    return Response.json({
      projection:p?{
        xfp:p.xfp,p25:p.p25,p75:p.p75,p90:p.p90,six_plus_probability:p.six_plus_probability,
        expected_goals:p.expected_goals,expected_assists:p.expected_assists,
        appearance_probability:p.appearance_probability,over60_probability:p.over60_probability,
        core_xfp:p.core_xfp,x_bonus:p.x_bonus,top25_rank:p.top25_rank,top25_score:p.top25_score,
      }:null,
      role:r?{
        signal:r.signal,last2_xi_probability:r.last2_xi_probability,previous2_xi_probability:r.previous2_xi_probability,
        last2_minutes:r.last2_minutes,previous2_minutes:r.previous2_minutes,team_goal_share:r.team_goal_share,
      }:null,
      season:s?{
        six_plus_count:s.six_plus_count,xg_total:s.xg_total,xa_per90:s.xa_per90,xa_model_per90:s.xa_model_per90,
        shots:s.shots,shots_on_target:s.shots_on_target,shot_share:s.shot_share,key_passes:s.key_passes,
        chance_creation_share:s.chance_creation_share,attack_contribution_share:s.attack_contribution_share,
      }:null,
      modelFeatures:mf?{effective_xa_per90:mf.effective_xa_per90}:null,
    },{status:200,headers})
  }catch(error){
    reportServerError('api:pro-player',error)
    return Response.json({error:'Pro oyuncu analizi şu anda hazırlanamadı.'},{status:500,headers})
  }
}
