export const dynamic='force-dynamic'

const BUILD_SHA=process.env.NEXT_PUBLIC_BUILD_SHA||'dev'

export async function GET(){
  return Response.json({
    ok:true,
    sha:BUILD_SHA,
    service:'tff-fantezi',
  },{headers:{'Cache-Control':'no-store'}})
}
