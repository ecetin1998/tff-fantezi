'use client'

import {useState} from 'react'

export default function SignupPasswordField(){
  const [visible,setVisible]=useState(false)
  return <div className="signup-password-field">
    <label htmlFor="signup-password">Şifre</label>
    <div className="signup-password-input">
      <input id="signup-password" name="password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} aria-describedby="signup-password-hint" required/>
      <button type="button" className="signup-password-toggle" onClick={()=>setVisible(value=>!value)} aria-label={visible?'Şifreyi gizle':'Şifreyi göster'} aria-pressed={visible}>{visible?'Gizle':'Göster'}</button>
    </div>
    <small id="signup-password-hint" className="signup-password-hint">Şifre en az 8 karakter olmalı.</small>
  </div>
}
