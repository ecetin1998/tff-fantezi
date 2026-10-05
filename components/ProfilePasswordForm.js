'use client'

import {useActionState,useEffect,useRef} from 'react'
import {changePassword} from '@/app/actions'

const INITIAL_STATE={ok:false,error:null,message:null}

export default function ProfilePasswordForm(){
  const [state,formAction,pending]=useActionState(changePassword,INITIAL_STATE)
  const formRef=useRef(null)

  useEffect(()=>{
    if(state?.ok)formRef.current?.reset()
  },[state?.ok])

  return <form ref={formRef} className="auth-form" action={formAction}>
    {state?.error?<div className="alert error" role="alert">{state.error}</div>:null}
    {state?.message?<div className="alert" role="status">✓ {state.message}</div>:null}
    <label>Yeni şifre
      <input name="password" type="password" autoComplete="new-password" minLength="8" required/>
    </label>
    <label>Yeni şifre tekrar
      <input name="confirm_password" type="password" autoComplete="new-password" minLength="8" required/>
    </label>
    <p className="muted" style={{margin:'-2px 0 2px'}}>En az 8 karakter kullan.</p>
    <button className="cta" type="submit" disabled={pending}>
      {pending?'Şifre güncelleniyor…':'Şifreyi değiştir'}
    </button>
  </form>
}
