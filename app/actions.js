'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData) {
  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/squad')
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tff-fantezi.vercel.app'

export async function signup(formData) {
  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options:{ emailRedirectTo: `${SITE_URL}/auth/confirm` }
  })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/login?message=' + encodeURIComponent('Doğrulama e-postasını kontrol et. Mail gelmezse aşağıdan tekrar gönderebilirsin.'))
}

export async function resendConfirmation(formData) {
  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  if (!email) redirect('/login?error=' + encodeURIComponent('E-posta adresini gir.'))
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/confirm` }
  })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/login?message=' + encodeURIComponent('Doğrulama e-postası tekrar gönderildi. Gelen kutusu ve spam klasörünü kontrol et.'))
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function saveSquad(formData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')
  let ids = []
  let squadState = []
  try { ids = JSON.parse(String(formData.get('player_ids') || '[]')).map(Number).filter(Boolean) } catch {}
  try {
    squadState = JSON.parse(String(formData.get('squad_state') || '[]'))
      .map(x => ({
        player_id: Number(x.player_id),
        is_captain: Boolean(x.is_captain),
        bench_order: x.bench_order === null || x.bench_order === undefined ? null : Number(x.bench_order)
      }))
      .filter(x => x.player_id)
  } catch {}
  ids = [...new Set(ids)]
  if (ids.length !== 15) redirect('/squad?error=' + encodeURIComponent('Kadro tam 15 oyuncu olmalı.'))
  const { data: players } = await supabase.from('scout_players').select('id,position,price').in('id',ids)
  if ((players||[]).length !== 15) redirect('/squad?error=' + encodeURIComponent('Oyuncu listesi doğrulanamadı.'))
  const counts = (players||[]).reduce((a,p)=>(a[p.position]=(a[p.position]||0)+1,a),{})
  if (counts.GK!==2 || counts.DEF!==5 || counts.MID!==5 || counts.FWD!==3) redirect('/squad?error=' + encodeURIComponent('Kadro dağılımı 2 GK / 5 DEF / 5 MID / 3 FWD olmalı.'))
  const total = (players||[]).reduce((s,p)=>s+Number(p.price||0),0)
  if (total > 100.0001) redirect('/squad?error=' + encodeURIComponent('100m bütçe aşıldı.'))
  const { data: existing } = await supabase.from('scout_user_squads').select('id').eq('user_id',userId).eq('is_active',true).maybeSingle()
  let squadId = existing?.id
  if (!squadId) {
    const { data, error } = await supabase.from('scout_user_squads').insert({user_id:userId,name:'Benim Kadrom',bank:Number((100-total).toFixed(2)),is_active:true}).select('id').single()
    if (error) redirect('/squad?error=' + encodeURIComponent(error.message))
    squadId = data.id
  } else {
    await supabase.from('scout_user_squads').update({bank:Number((100-total).toFixed(2)),updated_at:new Date().toISOString()}).eq('id',squadId)
    await supabase.from('scout_user_squad_members').delete().eq('squad_id',squadId)
  }
  const stateById = new Map(squadState.map(x => [x.player_id, x]))
  const hasStructuredState =
    squadState.length === 15 &&
    squadState.filter(x => x.bench_order === null).length === 11 &&
    squadState.filter(x => Number.isInteger(x.bench_order) && x.bench_order >= 1 && x.bench_order <= 4).length === 4 &&
    squadState.filter(x => x.is_captain && x.bench_order === null).length === 1

  const payload = ids.map(player_id => {
    const state = hasStructuredState ? stateById.get(player_id) : null
    return {
      squad_id:squadId,
      player_id,
      is_captain:Boolean(state?.is_captain),
      bench_order:state ? state.bench_order : null
    }
  })
  const { error } = await supabase.from('scout_user_squad_members').insert(payload)
  if (error) redirect('/squad?error=' + encodeURIComponent(error.message))
  redirect('/squad?saved=1')
}

export async function joinProWaitlist() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login?message=' + encodeURIComponent('Pro talebini kaydetmek için giriş yap.'))
  await supabase.from('scout_pro_interest').upsert({user_id:userId,source:'pricing'})
  redirect('/pricing?joined=1')
}
