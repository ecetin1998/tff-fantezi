'use client'

import {useEffect, useRef, useState} from 'react'

export default function SignupSuccessDialog(){
  const [open,setOpen]=useState(false)
  const dialogRef=useRef(null)

  useEffect(()=>{
    const url=new URL(window.location.href)
    if(url.searchParams.get('signup')!=='success')return
    // Clear the one-time flag to prevent a repeat on refresh or browser back.
    url.searchParams.delete('signup')
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
    setOpen(true)
  },[])

  useEffect(()=>{
    if(!open)return
    dialogRef.current?.focus()
  },[open])

  if(!open)return null

  return <div className="signup-success-overlay" role="presentation">
    <div ref={dialogRef} tabIndex={-1} className="card signup-success-dialog" role="dialog" aria-modal="true" aria-labelledby="signup-success-title" aria-describedby="signup-success-description">
      <span className="eyebrow">HOŞ GELDİN</span>
      <h2 id="signup-success-title">Kayıt başarılı!</h2>
      <p id="signup-success-description">Hesabın oluşturuldu ve giriş yaptın. Fantezi Lig Rehberi'ni kullanmaya başlayabilirsin.</p>
      <button className="cta" type="button" onClick={()=>setOpen(false)}>Tamam</button>
    </div>
  </div>
}
