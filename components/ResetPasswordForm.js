'use client'

import {useEffect,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {updatePassword} from '@/app/actions'

export default function ResetPasswordForm({serverError=null}){
  const [ready,setReady]=useState(false)
  const [linkError,setLinkError]=useState(null)

  useEffect(()=>{
    let cancelled=false

    async function establishRecoverySession(){
      const supabase=createClient()
      const url=new URL(window.location.href)
      const code=url.searchParams.get('code')
      const hash=new URLSearchParams(url.hash.slice(1))
      const accessToken=hash.get('access_token')
      const refreshToken=hash.get('refresh_token')

      try{
        let error=null
        if(code){
          ;({error}=await supabase.auth.exchangeCodeForSession(code))
          if(!error){
            url.searchParams.delete('code')
            window.history.replaceState(null,'',url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():''))
          }
        }else if(accessToken&&refreshToken){
          ;({error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken}))
          if(!error)window.history.replaceState(null,'',url.pathname+url.search)
        }else{
          const {data,error:sessionError}=await supabase.auth.getSession()
          error=sessionError
          if(!error&&!data?.session)throw new Error('Geçerli şifre yenileme oturumu bulunamadı.')
        }
        if(error)throw error
        if(!cancelled)setReady(true)
      }catch{
        if(!cancelled)setLinkError('Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Giriş sayfasından yeni bağlantı iste.')
      }
    }

    establishRecoverySession()
    return()=>{cancelled=true}
  },[])

  return <>
    {serverError?<div className="alert error">{serverError}</div>:null}
    {linkError?<div className="alert error">{linkError}</div>:null}
    {!ready&&!linkError?<div className="alert">Şifre yenileme bağlantısı doğrulanıyor...</div>:null}
    {ready?<form className="auth-form" action={updatePassword}>
      <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" minLength="8" required/></label>
      <label>Yeni şifre tekrar<input name="confirm_password" type="password" autoComplete="new-password" minLength="8" required/></label>
      <button className="cta" type="submit">Şifreyi güncelle</button>
    </form>:null}
  </>
}
