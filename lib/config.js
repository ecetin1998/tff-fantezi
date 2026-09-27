const DEFAULT_SUPABASE_URL='https://nnoagjayvrwyjtizhnfz.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY='sb_publishable_cT2X9dM8D3ct0KLJFXOelA_GgtzPFtY'
const DEFAULT_SITE_URL='https://tff-fantezi.ecetin1998.workers.dev'

export const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||DEFAULT_SUPABASE_URL
export const SUPABASE_PUBLISHABLE_KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||DEFAULT_SUPABASE_PUBLISHABLE_KEY
export const SITE_URL=String(process.env.NEXT_PUBLIC_SITE_URL||DEFAULT_SITE_URL).replace(/\/+$/,'')
export const APP_NAME='Fantezi Scout'
