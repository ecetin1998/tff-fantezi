'use server'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData) {
  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/squad')
}

export async function signup(formData) {
  const supabase = await createClient()
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const h = await headers()
  const origin = h.get('origin') || ''
  const { error } = await supabase.auth.signUp({ email, password, options:{ emailRedirectTo: `${origin}/auth/confirm` } })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/login?message=' + encodeURIComponent('Doğrulama e-postasını kontrol et.'))
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
  try { ids = JSON.parse(String(formData.get('player_ids') || '[]')).map(Number).filter(Boolean) } catch {}
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
  const payload = ids.map(player_id=>({squad_id:squadId,player_id}))
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
