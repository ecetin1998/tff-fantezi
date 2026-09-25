'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ConfirmEmailPage(){
  const [message,setMessage]=useState('E-posta doğrulanıyor...')

  useEffect(()=>{
    let cancelled=false

    async function confirm(){
      const supabase=createClient()
      const url=new URL(window.location.href)
      const tokenHash=url.searchParams.get('token_hash')
      const type=url.searchParams.get('type')
      const code=url.searchParams.get('code')
      const hash=new URLSearchParams(url.hash.slice(1))
      const accessToken=hash.get('access_token')
      const refreshToken=hash.get('refresh_token')

      try{
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

        if(authError) throw authError
        if(cancelled)return
        setMessage('E-posta doğrulandı. Kadrona yönlendiriliyorsun...')
        window.setTimeout(()=>window.location.replace('/squad'),300)
      }catch(error){
        if(cancelled)return
        const detail=error instanceof Error?error.message:'Doğrulama tamamlanamadı.'
        setMessage('Doğrulama tamamlanamadı.')
        window.setTimeout(()=>window.location.replace('/login?error='+encodeURIComponent(detail)),700)
      }
    }

    confirm()
    return()=>{cancelled=true}
  },[])

  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESAP DOĞRULAMA</span>
    <h1>E-posta kontrolü</h1>
    <p>{message}</p>
  </div></div>
}
