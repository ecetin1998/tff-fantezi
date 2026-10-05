'use server'
import {createClient} from '@/lib/supabase/server'
import {redirect} from 'next/navigation'
import {headers} from 'next/headers'
import {reportServerError} from '@/lib/observability'
import {passwordPolicyCode} from '@/lib/passwordSecurity'
import {BENCH_SIZE,BUDGET,FORMATIONS,MAX_PLAYERS_PER_CLUB,SQUAD_LIMITS,SQUAD_SIZE,STARTING_GK,STARTING_XI_SIZE} from '@/lib/rules'
import {SUPABASE_PUBLISHABLE_KEY,SUPABASE_URL} from '@/lib/config'
import {MANAGER_CARD_NONE,formationsForCard,managerCardInfo,normalizeManagerCard,squadLimitsForCard} from '@/lib/managerCards'

const DUMMY_LOGIN_ALIASES=new Set(['adminfree','adminpro','emircan','baris','serhat','oguz','serdar','erdem','celil','ekin'])

async function signInDummyAccount(supabase,username,password){
  const response=await fetch(SUPABASE_URL+'/functions/v1/dummy-login',{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({username,password}),
    cache:'no-store',
  })
  if(!response.ok)return {error:{code:'invalid_credentials',message:'Invalid login credentials'}}
  const payload=await response.json()
  if(!payload?.token_hash)return {error:{code:'auth_failed',message:'Dummy login token missing'}}
  return supabase.auth.verifyOtp({type:payload.type||'magiclink',token_hash:payload.token_hash})
}

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
  const key=String(message).match(/(AUTH_REQUIRED|PRO_REQUIRED|INVALID_MANAGER_CARD|INVALID_SQUAD|SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS|SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER|INVALID_POSITION_COUNTS|BUDGET_EXCEEDED|INVALID_STARTING_XI|INVALID_BENCH|INVALID_BENCH_ORDER|INVALID_CAPTAIN|INVALID_FORMATION|CLUB_LIMIT_EXCEEDED)/)?.[1]
  return ({
    AUTH_REQUIRED:'Oturum bulunamadı. Tekrar giriş yap.',
    PRO_REQUIRED:'Menajer kartları Gelişmiş üyeliğe özeldir.',
    INVALID_MANAGER_CARD:'Geçersiz menajer kartı seçimi.',
    SQUAD_LOCKED:'Bu maç haftası kilitlendi. Kadro artık değiştirilemez.',
    GAMEWEEK_DEADLINE_MISSING:'Maç haftası son tarihi bulunamadı.',
    INVALID_SQUAD:'Kadro verisi geçersiz.',
    SQUAD_MUST_HAVE_15_UNIQUE_PLAYERS:`Kadro ${SQUAD_SIZE} benzersiz oyuncudan oluşmalı.`,
    SQUAD_HAS_INACTIVE_OR_UNKNOWN_PLAYER:'Kadroda aktif olmayan veya bulunamayan oyuncu var.',
    INVALID_POSITION_COUNTS:'Kadro dağılımı seçili menajer kartının kurallarına uymalı.',
    BUDGET_EXCEEDED:'Seçili menajer kartı için bütçe sınırı aşıldı.',
    INVALID_STARTING_XI:'İlk 11 geçersiz.',
    INVALID_BENCH:'Yedek kulübesi tam 4 oyuncu olmalı.',
    INVALID_BENCH_ORDER:'Yedek sıraları 1, 2, 3, 4 olmalı.',
    INVALID_CAPTAIN:'İlk 11 içinde tam bir kaptan seçilmeli.',
    INVALID_FORMATION:'İlk 11 izin verilen dizilişlerden biri olmalı.',
    CLUB_LIMIT_EXCEEDED:`Aynı takımdan en fazla ${MAX_PLAYERS_PER_CLUB} oyuncu seçebilirsin.`,
  })[key]||'Kadro kaydedilemedi. Lütfen tekrar dene.'
}

export async function login(_prevState,formData){
  const supabase=await createClient()
  const identifier=String(formData.get('email')||'').trim()
  const normalized=identifier.toLowerCase()
  const password=String(formData.get('password')||'')
  const {error}=DUMMY_LOGIN_ALIASES.has(normalized)
    ?await signInDummyAccount(supabase,normalized,password)
    :await supabase.auth.signInWithPassword({email:identifier,password})
  if(error)return {ok:false,error:authErrorCode(error)}
  return {ok:true,error:null}
}

async function getSiteUrl(){
  const configured=String(process.env.NEXT_PUBLIC_SITE_URL||'').trim().replace(/\/+$/,'')
  if(configured)return configured
  const h=await headers()
  const host=h.get('x-forwarded-host')||h.get('host')
  const proto=h.get('x-forwarded-proto')||(host?.includes('localhost')?'http':'https')
  return host?proto+'://'+host:'https://fanteziligrehberi.com'
}

export async function signup(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  const password=String(formData.get('password')||'')
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))redirect('/signup?error=email_required')
  const passwordPolicy=await passwordPolicyCode(password)
  if(passwordPolicy)redirect('/signup?error='+passwordPolicy)
  const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:siteUrl+'/confirm-email'}})
  if(error)redirect('/signup?error='+authErrorCode(error))
  redirect('/signup?message=check_email')
}

export async function resendConfirmation(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  if(!email)redirect('/signup?error=email_required#verification')
  const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:siteUrl+'/confirm-email'}})
  if(error)redirect('/signup?error='+authErrorCode(error)+'#verification')
  redirect('/signup?message=resend_sent#verification')
}

export async function requestPasswordReset(formData){
  const supabase=await createClient()
  const siteUrl=await getSiteUrl()
  const email=String(formData.get('email')||'').trim()
  if(!email)redirect('/forgot-password?error=email_required')
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:siteUrl+'/reset-password'})
  if(error)redirect('/forgot-password?error='+authErrorCode(error))
  redirect('/forgot-password?message=reset_sent')
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

export async function changePassword(_prevState,formData){
  const supabase=await createClient()
  const {data:claimsData}=await supabase.auth.getClaims()
  if(!claimsData?.claims?.sub)return {ok:false,error:'Oturum bulunamadı. Tekrar giriş yap.',message:null}

  const password=String(formData.get('password')||'')
  const confirm=String(formData.get('confirm_password')||'')
  if(password!==confirm)return {ok:false,error:'Şifreler eşleşmiyor.',message:null}

  const passwordPolicy=await passwordPolicyCode(password)
  if(passwordPolicy){
    const errors={
      weak_password:'Şifre en az 8 karakter olmalı.',
      leaked_password:'Bu şifre bilinen veri sızıntılarında yer alıyor. Başka bir şifre seç.',
      password_check_failed:'Şifre güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
    }
    return {ok:false,error:errors[passwordPolicy]||'Şifre güncellenemedi.',message:null}
  }

  const {error}=await supabase.auth.updateUser({password})
  if(error){
    const code=authErrorCode(error)
    const errors={
      same_password:'Yeni şifre mevcut şifrenle aynı olamaz.',
      weak_password:'Şifre en az 8 karakter olmalı.',
      leaked_password:'Bu şifre bilinen veri sızıntılarında yer alıyor. Başka bir şifre seç.',
      password_check_failed:'Şifre güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
    }
    return {ok:false,error:errors[code]||'Şifre güncellenemedi. Lütfen tekrar dene.',message:null}
  }

  return {ok:true,error:null,message:'Şifren güncellendi.'}
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
  const managerCard=normalizeManagerCard(formData.get('manager_card')||MANAGER_CARD_NONE)
  const cardInfo=managerCardInfo(managerCard)
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

  if(managerCard!==MANAGER_CARD_NONE){
    const {data:subscription,error:subscriptionError}=await supabase.from('scout_subscriptions')
      .select('plan,status,valid_until').eq('user_id',userId).maybeSingle()
    if(subscriptionError){
      reportServerError('action:saveSquad:subscription',subscriptionError)
      return {ok:false,error:'Üyelik durumu doğrulanamadı.',signature:''}
    }
    const activePro=subscription?.plan==='pro'&&['active','trialing'].includes(subscription?.status)&&
      (!subscription?.valid_until||new Date(subscription.valid_until)>new Date())
    if(!activePro)return {ok:false,error:'Menajer kartları Gelişmiş üyeliğe özeldir.',signature:''}
  }

  ids=[...new Set(ids)]
  const stateIds=[...new Set(squadState.map(x=>x.player_id))]
  if(ids.length!==SQUAD_SIZE||squadState.length!==SQUAD_SIZE||stateIds.length!==SQUAD_SIZE)return {ok:false,error:`Kadro ${SQUAD_SIZE} benzersiz oyuncudan oluşmalı.`,signature:''}
  if(ids.some(id=>!stateIds.includes(id))||stateIds.some(id=>!ids.includes(id)))return {ok:false,error:'Kadro ile ilk 11/yedek bilgileri eşleşmiyor.',signature:''}

  const {data:players,error:playerError}=await supabase.from('scout_players').select('id,team_id,position,price,active').in('id',ids)
  if(playerError){
    reportServerError('action:saveSquad:players',playerError)
    return {ok:false,error:'Oyuncu listesi doğrulanamadı.',signature:''}
  }
  if((players||[]).length!==SQUAD_SIZE||(players||[]).some(p=>!p.active))return {ok:false,error:'Kadroda aktif olmayan veya bulunamayan oyuncu var.',signature:''}

  const counts=(players||[]).reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const effectiveSquadLimits=squadLimitsForCard(managerCard,SQUAD_LIMITS)
  if(!Object.entries(effectiveSquadLimits).every(([position,required])=>(counts[position]||0)===required))return {ok:false,error:`Kadro dağılımı ${effectiveSquadLimits.GK} KL / ${effectiveSquadLimits.DEF} DEF / ${effectiveSquadLimits.MID} OS / ${effectiveSquadLimits.FWD} FOR olmalı.`,signature:''}
  const total=(players||[]).reduce((s,p)=>s+Number(p.price||0),0)
  const effectiveBudget=cardInfo.unlimitedBudget?Number.POSITIVE_INFINITY:Number(cardInfo.budget||BUDGET)
  if(Number.isFinite(effectiveBudget)&&total>effectiveBudget+.0001)return {ok:false,error:`${effectiveBudget}m bütçe aşıldı.`,signature:''}

  if(MAX_PLAYERS_PER_CLUB){
    const clubCounts=(players||[]).reduce((a,p)=>(a[p.team_id]=(a[p.team_id]||0)+1,a),{})
    if(Object.values(clubCounts).some(n=>n>MAX_PLAYERS_PER_CLUB))return {ok:false,error:'Takım başına oyuncu sınırı aşıldı.',signature:''}
  }

  const playerMap=new Map((players||[]).map(p=>[p.id,p]))
  const xiState=squadState.filter(x=>x.bench_order===null)
  const benchState=squadState.filter(x=>x.bench_order!==null)
  const benchOrders=benchState.map(x=>x.bench_order).sort((a,b)=>a-b)
  if(xiState.length!==STARTING_XI_SIZE||benchState.length!==BENCH_SIZE||benchOrders.join(',')!==Array.from({length:BENCH_SIZE},(_,i)=>i+1).join(','))return {ok:false,error:'İlk 11 veya yedek sırası geçersiz.',signature:''}
  const xi=xiState.map(x=>playerMap.get(x.player_id)).filter(Boolean)
  const xiCounts=xi.reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  const formation=(xiCounts.DEF||0)+'-'+(xiCounts.MID||0)+'-'+(xiCounts.FWD||0)
  const formationAllowed=formationsForCard(managerCard,FORMATIONS).includes(formation)
  if((xiCounts.GK||0)!==STARTING_GK||!formationAllowed)return {ok:false,error:'İlk 11 seçilen menajer kartının izin verdiği dizilişlerden biri olmalı.',signature:''}
  if(squadState.filter(x=>x.is_captain).length!==1||xiState.filter(x=>x.is_captain).length!==1)return {ok:false,error:'İlk 11 içinde tam bir kaptan seçilmeli.',signature:''}

  const rpcMembers=squadState.map(row=>({...row,manager_card:managerCard}))
  const {error}=await supabase.rpc('save_user_squad',{p_members:rpcMembers})
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
  const {error}=await supabase.from('scout_pro_interest').upsert({user_id:userId,source:'pricing'},{onConflict:'user_id',ignoreDuplicates:true})
  if(error){
    reportServerError('action:joinProWaitlist',error)
    redirect('/pricing?error=waitlist_failed')
  }
  redirect('/pricing?joined=1')
}
