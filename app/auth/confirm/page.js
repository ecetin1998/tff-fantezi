'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage(){
  const router=useRouter()
  const [message,setMessage]=useState('E-posta doğrulanıyor...')

  useEffect(()=>{
    let active=true

    async function confirm(){
      const supabase=createClient()
      const url=new URL(window.location.href)
      const tokenHash=url.searchParams.get('token_hash')
      const type=url.searchParams.get('type')
      const code=url.searchParams.get('code')
      const hash=new URLSearchParams(url.hash.replace(/^#/,''))
      const accessToken=hash.get('access_token')
      const refreshToken=hash.get('refresh_token')

      try{
        let error=null

        if(tokenHash&&type){
          ;({error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type}))
        }else if(code){
          ;({error}=await supabase.auth.exchangeCodeForSession(code))
        }else if(accessToken&&refreshToken){
          ;({error}=await supabase.auth.setSession({
            access_token:accessToken,
            refresh_token:refreshToken,
          }))
        }else{
          const {data,error:sessionError}=await supabase.auth.getSession()
          error=sessionError
          if(!error&&!data?.session) throw new Error('Doğrulama bağlantısında geçerli oturum bulunamadı.')
        }

        if(error) throw error
        if(!active)return
        setMessage('E-posta doğrulandı. Kadrona yönlendiriliyorsun...')
        window.setTimeout(()=>router.replace('/squad'),350)
      }catch(error){
        if(!active)return
        const detail=error instanceof Error?error.message:'Doğrulama tamamlanamadı.'
        setMessage('Doğrulama tamamlanamadı.')
        window.setTimeout(()=>router.replace('/login?error='+encodeURIComponent(detail)),700)
      }
    }

    confirm()
    return()=>{active=false}
  },[router])

  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESAP DOĞRULAMA</span>
    <h1>E-posta kontrolü</h1>
    <p>{message}</p>
  </div></div>
}
