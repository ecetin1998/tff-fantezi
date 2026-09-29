export const dynamic='force-dynamic'

const BUILD_SHA=
  process.env.VERCEL_GIT_COMMIT_SHA||
  process.env.NEXT_PUBLIC_BUILD_SHA||
  process.env.CF_PAGES_COMMIT_SHA||
  'unknown'

export async function GET(){
  return Response.json({
    ok:true,
    sha:BUILD_SHA,
    service:'tff-fantezi',
    environment:process.env.VERCEL_ENV||process.env.NODE_ENV||'unknown',
  },{headers:{'Cache-Control':'no-store'}})
}
