import {reportServerError} from '@/lib/observability'
import { getAvailability, getMatches, getPlayersWithProjection, getRecommendation } from '@/lib/data'

export const dynamic='force-dynamic'
const SCHEMA_VERSION='1.0'
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}

function reply(payload,status=200){ return Response.json(payload,{status,headers}) }

function authorized(request){
  const expected=String(process.env.SCOUT_DATA_API_KEY||'')
  const supplied=String(request.headers.get('x-api-key')||'')
  return expected.length>=24 && supplied===expected
}

export async function GET(request){
  try{
    if(!authorized(request)) return reply({schema_version:SCHEMA_VERSION,error:'API anahtarı gerekli.'},401)

    const url=new URL(request.url)
    const requestedGw=Number(url.searchParams.get('gw')||0)
    const [playerData,matchData,recommended,alternative,availability]=await Promise.all([
      getPlayersWithProjection(),getMatches(),getRecommendation('recommended'),
      getRecommendation('alternative'),getAvailability(),
    ])

    const currentGw=Number(playerData.run?.gameweek||0)
    if(requestedGw && requestedGw!==currentGw){
      return reply({schema_version:SCHEMA_VERSION,error:'İstenen maç haftası güncel yayınla eşleşmiyor.',requested_gameweek:requestedGw,current_gameweek:currentGw},409)
    }

    const topPlayers=[...(playerData.players||[])]
      .sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))
      .slice(0,35)
      .map(p=>({
        id:p.id,name:p.display_name||p.full_name,team:p.team,position:p.position,price:Number(p.price||0),
        xfp:Number(p.projection?.xfp||0),p90:Number(p.projection?.p90||0),
        xi_probability:Number(p.projection?.xi_probability||0),x_minutes:Number(p.projection?.x_minutes||0),
        six_plus_probability:Number(p.projection?.six_plus_probability||0),opponent:p.projection?.opponent_name||null,
        venue:p.projection?.venue||null,expected_goals:Number(p.projection?.expected_goals||0),
        expected_assists:Number(p.projection?.expected_assists||0),
        availability_probability:Number(p.projection?.availability_probability??1),
      }))

    const matches=(matchData.matches||[]).map(m=>({
      home:m.home_team,away:m.away_team,kickoff_at:m.kickoff_at,
      home_xg:Number(m.home_xg||0),away_xg:Number(m.away_xg||0),
      home_win_probability:Number(m.home_win_probability||0),draw_probability:Number(m.draw_probability||0),
      away_win_probability:Number(m.away_win_probability||0),
      home_cs_probability:Number(m.home_cs_probability||0),away_cs_probability:Number(m.away_cs_probability||0),
    }))

    const compactSquad=data=>({
      budget:Number(data?.recommendation?.budget||0),xi_xfp:Number(data?.recommendation?.xi_xfp||0),
      players:(data?.members||[]).map(m=>({
        id:m.player_id,name:m.player?.display_name||m.player?.full_name||null,
        position:m.player?.position||null,price:Number(m.player?.price||0),
        captain:Boolean(m.is_captain),bench_order:m.bench_order,
      })),
    })

    const issues=(availability.rows||[]).filter(a=>Number(a.availability_probability??1)<.99).slice(0,50).map(a=>({
      player_id:a.player_id,name:a.player?.display_name||a.player?.full_name||null,team:a.team||null,
      probability:Number(a.availability_probability??1),reason:a.reason||a.source_reason||null,
      expected_return:a.expected_return||null,suspension_fixture:a.suspension_fixture||null,
    }))

    return reply({
      schema_version:SCHEMA_VERSION,gameweek:currentGw,generated_at:new Date().toISOString(),
      model_updated_at:playerData.run?.generated_at||null,source_updated_at:playerData.run?.source_updated_at||null,
      top_players:topPlayers,matches,
      squads:{recommended:compactSquad(recommended),alternative:compactSquad(alternative)},
      availability_issues:issues,
    })
  }catch(error){
    reportServerError('api:scout-data-summary',error)
    return reply({schema_version:SCHEMA_VERSION,error:'Özet veri şu anda hazırlanamadı.'},500)
  }
}
