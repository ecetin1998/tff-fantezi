'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions'

const matches=(path,href)=>href==='/' ? path==='/' : path===href || path.startsWith(href+'/')

export function DesktopNavLinks({ primary, analysis }){
  const path=usePathname()
  const [open,setOpen]=useState(false)
  const wrapRef=useRef(null)

  useEffect(()=>setOpen(false),[path])

  useEffect(()=>{
    const onPointer=e=>{
      if(open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey=e=>{ if(e.key==='Escape') setOpen(false) }
    document.addEventListener('pointerdown',onPointer)
    document.addEventListener('keydown',onKey)
    return ()=>{
      document.removeEventListener('pointerdown',onPointer)
      document.removeEventListener('keydown',onKey)
    }
  },[open])

  return <nav className="desktop-nav">
    {primary.map(([href,label])=>
      <Link className={matches(path,href)?'nav-active':''} key={href} href={href}>{label}</Link>
    )}
    <div className="desktop-more" ref={wrapRef}>
      <button
        type="button"
        className={analysis.some(([href])=>matches(path,href))?'nav-active':''}
        aria-expanded={open}
        onClick={()=>setOpen(v=>!v)}
      >
        Analizler <span className={open?'chevron up':'chevron'}>⌄</span>
      </button>
      {open?<div className="desktop-more-panel">
        {analysis.map(([href,label])=>
          <Link onClick={()=>setOpen(false)} className={matches(path,href)?'nav-active':''} key={href} href={href}>{label}</Link>
        )}
      </div>:null}
    </div>
  </nav>
}

export function MobileMenu({ primary, analysis, signedIn }){
  const path=usePathname()
  const [open,setOpen]=useState(false)
  const wrapRef=useRef(null)

  useEffect(()=>setOpen(false),[path])

  useEffect(()=>{
    const onPointer=e=>{
      if(open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey=e=>{ if(e.key==='Escape') setOpen(false) }
    document.addEventListener('pointerdown',onPointer)
    document.addEventListener('keydown',onKey)
    return ()=>{
      document.removeEventListener('pointerdown',onPointer)
      document.removeEventListener('keydown',onKey)
    }
  },[open])

  const close=()=>setOpen(false)

  return <div className="mobile-menu compact-mobile-menu" ref={wrapRef}>
    <button
      type="button"
      className={open?'mobile-menu-trigger open':'mobile-menu-trigger'}
      aria-label={open?'Menüyü kapat':'Menüyü aç'}
      aria-expanded={open}
      onClick={()=>setOpen(v=>!v)}
    >
      <span/><span/><span/>
    </button>

    {open?<div className="mobile-menu-panel compact-mobile-menu-panel">
      {[...primary,...analysis].map(([href,label])=>
        <Link onClick={close} className={matches(path,href)?'active':''} key={href} href={href}>{label}</Link>
      )}
      <Link onClick={close} href="/pricing">Scout Pro</Link>
      {signedIn
        ? <form action={logout}><button type="submit">Çıkış</button></form>
        : <Link onClick={close} href="/login">Giriş / Kayıt</Link>}
    </div>:null}
  </div>
}

export function MobileBottomNav({ items }){
  const path=usePathname()
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
    {items.map(([href,icon,label])=>
      <Link className={matches(path,href)?'active':''} href={href} key={href}>
        <span>{icon}</span><b>{label}</b>
      </Link>
    )}
  </nav>
}
