'use server'
import {createClient} from '@/lib/supabase/server'
import {redirect} from 'next/navigation'
import {headers} from 'next/headers'
import {reportServerError} from '@/lib/observability'
import {passwordPolicyCode} from '@/lib/passwordSecurity'

const MAX_PER_CLUB=null
const FORMATIONS=new Set(['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1'])

function authErrorCode(error){
  const code=String(error?.code||'').toLowerCase()
  const message=String(error?.message||'').toLowerCase()
  if(code.includes('invalid_credentials')||message.includes('invalid login credentials'))return 'invalid_credentials'
  if(code.includes('email_not_confirmed')||message.includes('email not confirmed'))return 'email_not_confirmed'
  if(code.includes('user_already')||message.includes('already registered'))return 'already_registered'
  if(code.includes('weak_password')||message.includes('password should be'))return 'weak_password'
  if(code.includes('over_email')||message.includes('rate limit'))return 'rate_limited'
  if(code.includes('same_password')||message.includes('same password'))return 'same_password'
  return 'auth_failed'
}

function squadError(message=''){
  const key=String(message).match(/(AUTH_REQUIRED|INVALID_SQUAD|SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS|SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER|INVALID_POSITION_COUNTS|BUDGET_EXCEEDED|INVALID_STARTING_XI|INVALID_BENCH|INVALID_BENCH_ORDER|INVALID_CAPTAIN|INVALID_FORMATION)/)?.[1]
  return ({
    AUTH_REQUIRED:'Oturum bulunamadı. Tekrar giriş yap.',
    INVALID_SQUAD:'Kadro verisi geçersiz.',
    SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS:'Kadro 15 benzersiz oyuncudan oluşmalı.',
    SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER:'Kadroda aktif olmayan veya bulunamayan oyuncu var.',
    INVALID_POSITION_COUNTS:'Kadro dağılımı 2 KL / 5 DEF / 5 OS / 3 FOR olmalı.',
    BUDGET_EXCEEDED:'100m bütçe aşıldı.',
    INVALID_STARTING_XI:'İlk 11 geçersiz.',
    INVALID_BENCH:'Yedek kulübesi tam 4 oyuncu olmalı.',
    INVALID_BENCH_ORDER:'Yedek sıraları 1, 2, 3, 4 olmalı.',
    INVALID_CAPTAIN:'İlk 11 içinde tam bir kaptan seçilmeli.',
    INVALID_FORMATION:'İlk 11 izin verilen dizilişlerden biri olmalı.',
  })[key]||'Kadro kaydedilemedi. Lütfen tekrar dene.'
}

export async function login(formData){
  const supabase=await createClient()
  const email=String(formData.get('email')||'').trim()
  const password=String(formData.get('password')||'')
  const {error}=await supabase.auth.signInWithPassword({email,password})
  if(error)redirect('/login?error='+authErrorCode(error))
  redirect('/squad')
}

async function getSiteUrl(){
  const configured=String(process.env.NEXT_PUBLIC_SITE_URL||'').trim().replace(/\/+$/,'')
  if(configured)return configured
  const h=await headers()
  const host=h.get('x-forwarded-host')||h.get('host')
  const proto=h.get('x-forwarded-proto')||(host?.includes('localhost')?'http':'https')
  return host?proto+'://'+host:'https://tff-fantezi.vercel.app'
}

export async function signup(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  const password=String(formData.get('password')||'')
  const passwordPolicy=await passwordPolicyCode(password)
  if(passwordPolicy)redirect('/login?error='+passwordPolicy)
  const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:siteUrl+'/confirm-email'}})
  if(error)redirect('/login?error='+authErrorCode(error))
  redirect('/login?message=check_email')
}

export async function resendConfirmation(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  if(!email)redirect('/login?error=email_required')
  const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:siteUrl+'/confirm-email'}})
  if(error)redirect('/login?error='+authErrorCode(error))
  redirect('/login?message=resend_sent')
}

export async function requestPasswordReset(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  if(!email)redirect('/login?error=email_required')
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:siteUrl+'/reset-password'})
  if(error)redirect('/login?error='+authErrorCode(error))
  redirect('/login?message=reset_sent')
}

export async function updatePassword(formData){
  const supabase=await createClient()
  const password=String(formData.get('password')||'')
  const confirm=String(formData.get('confirm_password')||'')
  if(password!==confirm)redirect('/reset-password?error=password_mismatch')
  const passwordPolicy=await passwordPolicyCode(password)
  if(passwordPolicy)redirect('/reset-password?error='+passwordPolicy)
  const {error}=await supabase.auth.updateUser({password})
  if(error)redirect('/reset-password?error='+authErrorCode(error))
  redirect('/login?message=password_updated')
}

export async function logout(){
  const supabase=await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function saveSquad(_prevState,formData){
  const supabase=await createClient()
  const {data:claimsData}=await supabase.auth.getClaims()
  const userId=claimsData?.claims?.sub
  if(!userId)return {ok:false,error:'Oturum bulunamadı. Tekrar giriş yap.',signature:''}

  const signature=String(formData.get('squad_signature')||'')
  let ids=[]
  let squadState=[]
  try{ids=JSON.parse(String(formData.get('player_ids')||'[]')).map(Number).filter(Number.isFinite)}catch{}
  try{
    squadState=JSON.parse(String(formData.get('squad_state')||'[]')).map(x=>({
      player_id:Number(x.player_id),
      is_captain:Boolean(x.is_captain),
      bench_order:x.bench_order===null||x.bench_order===undefined?null:Number(x.bench_order)
    })).filter(x=>Number.isFinite(x.player_id))
  }catch{}

  ids=[...new Set(ids)]
  const stateIds=[...new Set(squadState.map(x=>x.player_id))]
  if(ids.length!==15||squadState.length!==15||stateIds.length!==15)return {ok:false,error:'Kadro 15 benzersiz oyuncudan oluşmalı.',signature:''}
  if(ids.some(id=>!stateIds.includes(id))||stateIds.some(id=>!ids.includes(id)))return {ok:false,error:'Kadro ile ilk 11/yedek bilgileri eşleşmiyor.',signature:''}

  const {data:players,error:playerError}=await supabase.from('scout_players').select('id,team_id,position,price,active').in('id',ids)
  if(playerError){
    reportServerError('action:saveSquad:players',playerError)
    return {ok:false,error:'Oyuncu listesi doğrulanamadı.',signature:''}
  }
  if((players||[]).length!==15||(players||[]).some(p=>!p.active))return {ok:false,error:'Kadroda aktif olmayan veya bulunamayan oyuncu var.',signature:''}

  const counts=(players||[]).reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  if(counts.GK!==2||counts.DEF!==5||counts.MID!==5||counts.FWD!==3)return {ok:false,error:'Kadro dağılımı 2 KL / 5 DEF / 5 OS / 3 FOR olmalı.',signature:''}
  const total=(players||[]).reduce((s,p)=>s+Number(p.price||0),0)
  if(total>100.0001)return {ok:false,error:'100m bütçe aşıldı.',signature:''}

  if(MAX_PER_CLUB){
    const clubCounts=(players||[]).reduce((a,p)=>(a[p.team_id]=(a[p.team_id]||0)+1,a),{})
    if(Object.values(clubCounts).some(n=>n>MAX_PER_CLUB))return {ok:false,error:'Takım başına oyuncu sınırı aşıldı.',signature:''}
  }

  const playerMap=new Map((players||[]).map(p=>[p.id,p]))
  const xiState=squadState.filter(x=>x.bench_order===null)
  const benchState=squadState.filter(x=>x.bench_order!==null)
  const benchOrders=benchState.map(x=>x.bench_order).sort((a,b)=>a-b)
  if(xiState.length!==11||benchState.length!==4||benchOrders.join(',')!=='1,2,3,4')return {ok:false,error:'İlk 11 veya yedek sırası geçersiz.',signature:''}
  const xi=xiState.map(x=>playerMap.get(x.player_id)).filter(Boolean)
  const xiCounts=xi.reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const formation=(xiCounts.DEF||0)+'-'+(xiCounts.MID||0)+'-'+(xiCounts.FWD||0)
  if((xiCounts.GK||0)!==1||!FORMATIONS.has(formation))return {ok:false,error:'İlk 11 izin verilen dizilişlerden biri olmalı.',signature:''}
  if(squadState.filter(x=>x.is_captain).length!==1||xiState.filter(x=>x.is_captain).length!==1)return {ok:false,error:'İlk 11 içinde tam bir kaptan seçilmeli.',signature:''}

  const {error}=await supabase.rpc('save_user_squad',{p_members:squadState})
  if(error){
    reportServerError('action:saveSquad:rpc',error)
    return {ok:false,error:squadError(error.message),signature:''}
  }
  return {ok:true,error:'',signature}
}

export async function joinProWaitlist(){
  const supabase=await createClient()
  const {data:claimsData}=await supabase.auth.getClaims()
  const userId=claimsData?.claims?.sub
  if(!userId)redirect('/login?message=pro_login_required')
  const {error}=await supabase.from('scout_pro_interest').upsert({user_id:userId,source:'pricing'},{onConflict:'user_id'})
  if(error){
    reportServerError('action:joinProWaitlist',error)
    redirect('/pricing?error=waitlist_failed')
  }
  redirect('/pricing?joined=1')
}
