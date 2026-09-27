import {timingSafeEqual} from 'node:crypto'
import {reportServerError} from '@/lib/observability'
import {buildScoutSummary,SCOUT_FEED_SCHEMA_VERSION} from '@/lib/scoutFeed'

export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Vary':'x-api-key'}

function reply(payload,status=200){ return Response.json(payload,{status,headers}) }

function authorized(request){
  const expected=String(process.env.SCOUT_DATA_API_KEY||'')
  const supplied=String(request.headers.get('x-api-key')||'')
  if(expected.length<24)return false
  const a=Buffer.from(expected),b=Buffer.from(supplied)
  return a.length===b.length&&timingSafeEqual(a,b)
}

export async function GET(request){
  try{
    if(!authorized(request)) return reply({schema_version:SCOUT_FEED_SCHEMA_VERSION,error:'API anahtarı gerekli.'},401)

    const url=new URL(request.url)
    const requestedGw=Number(url.searchParams.get('gw')||0)
    const feed=await buildScoutSummary()

    if(requestedGw && requestedGw!==feed.gameweek){
      return reply({
        schema_version:SCOUT_FEED_SCHEMA_VERSION,
        error:'İstenen maç haftası güncel yayınla eşleşmiyor.',
        requested_gameweek:requestedGw,
        current_gameweek:feed.gameweek
      },409)
    }

    return reply(feed)
  }catch(error){
    reportServerError('api:scout-data-summary',error)
    return reply({schema_version:SCOUT_FEED_SCHEMA_VERSION,error:'Özet veri şu anda hazırlanamadı.'},500)
  }
}
