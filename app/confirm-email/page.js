'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ConfirmEmailPage(){
  const [message,setMessage]=useState('E-posta doğrulanıyor...')
  const [failed,setFailed]=useState(false)
  // React Strict Mode may re-run effects; confirmation tokens are single-use.
  const started=useRef(false)

  useEffect(()=>{
    if(started.current)return
    started.current=true

    async function confirm(){
      const supabase=createClient()
      const url=new URL(window.location.href)
      const tokenHash=url.searchParams.get('token_hash')
      const type=url.searchParams.get('type')
      const code=url.searchParams.get('code')
      const hash=new URLSearchParams(url.hash.slice(1))
      const accessToken=hash.get('access_token')
      const refreshToken=hash.get('refresh_token')
      const linkError=url.searchParams.get('error_description')||hash.get('error_description')

      try{
        if(linkError)throw new Error('Bağlantı geçersiz veya süresi dolmuş.')
        let authError=null

        if(tokenHash&&type){
          const result=await supabase.auth.verifyOtp({token_hash:tokenHash,type})
          authError=result.error
        }else if(code){
          const result=await supabase.auth.exchangeCodeForSession(code)
          authError=result.error
        }else if(accessToken&&refreshToken){
          const result=await supabase.auth.setSession({
            access_token:accessToken,
            refresh_token:refreshToken,
          })
          authError=result.error
        }else{
          const result=await supabase.auth.getSession()
          authError=result.error
          if(!authError&&!result.data?.session){
            throw new Error('Doğrulama bağlantısında geçerli oturum bulunamadı.')
          }
        }

        // A token may have been consumed already by the auth client or a previous visit.
        // Only accept that case when Supabase confirms the current user's email.
        const {data:{user},error:userError}=await supabase.auth.getUser()
        if(userError||!user?.email_confirmed_at)throw authError||userError||new Error('E-posta henüz doğrulanmamış.')

        window.history.replaceState(null,'',url.pathname)
        setMessage('E-posta doğrulandı. Kadrona yönlendiriliyorsun...')
        window.setTimeout(()=>window.location.replace('/squad'),300)
      }catch(error){
        setFailed(true)
        setMessage('Doğrulama bağlantısı kullanılamadı veya süresi dolmuş olabilir. Hesabına giriş yapabiliyorsan e-posta doğrulama durumunu kontrol edebilirsin. Aksi hâlde yeni doğrulama e-postası iste.')
      }
    }

    confirm()
  },[])

  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESAP DOĞRULAMA</span>
    <h1>E-posta kontrolü</h1>
    <p>{message}</p>
    {failed?<div className="auth-link-stack">
      <Link href="/login">Giriş yap</Link>
      <Link href="/signup#verification">Yeni doğrulama e-postası iste</Link>
    </div>:null}
  </div></div>
}
