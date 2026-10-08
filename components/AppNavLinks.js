'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const adminOnlyPaths=new Set(['/backtest','/model-health'])
const adminEmail='dummy.pro.20261001@example.com'
const visibleAnalysis=(items,email)=>items.filter(([href])=>!adminOnlyPaths.has(href)||email===adminEmail)

const matches=(path,href)=>href==='/' ? path==='/' : path===href || path.startsWith(href+'/')

export function DesktopNavLinks({ primary, analysis }){
  const path=usePathname()
  const [open,setOpen]=useState(false)
  const [adminEmailValue,setAdminEmailValue]=useState(null)
  const wrapRef=useRef(null)
  useEffect(()=>{const supabase=createClient();let alive=true;supabase.auth.getUser().then(({data})=>{if(alive)setAdminEmailValue(data?.user?.email||null)});const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive)setAdminEmailValue(session?.user?.email||null)});return()=>{alive=false;data.subscription.unsubscribe()}},[])


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
        className={visibleAnalysis(analysis,adminEmailValue).some(([href])=>matches(path,href))?'nav-active':''}
        aria-expanded={open}
        onClick={()=>setOpen(v=>!v)}
      >
        Detaylı Analizler <span className={open?'chevron up':'chevron'}>⌄</span>
      </button>
      {open?<div className="desktop-more-panel">
        {visibleAnalysis(analysis,adminEmailValue).map(([href,label])=>
          <Link prefetch={false} onClick={()=>setOpen(false)} className={matches(path,href)?'nav-active':''} key={href} href={href}>{label}</Link>
        )}
      </div>:null}
    </div>
  </nav>
}


function MenuIcon({ href }){
  const common={width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true}
  if(href==='/') return <svg {...common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
  if(href==='/players') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.3-6 5.5-6s5.1 2 5.5 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M15.5 14.5c3.1-.4 5 1.3 5.3 4.5"/></svg>
  if(href==='/points') return <svg {...common}><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>
  if(href==='/matches') return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="m8.7 9.4 3.3-2.1 3.3 2.1-1.2 3.8H9.9z"/></svg>
  if(href==='/squads') return <svg {...common}><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m16.5 15.5 1 1 2-2"/></svg>
  if(href==='/squad') return <svg {...common}><path d="M5 6.5 8.2 4 12 6l3.8-2L19 6.5V20H5z"/><path d="M8.2 4 9 9h6l.8-5"/><path d="M9 13h6"/></svg>
  if(href==='/teams') return <svg {...common}><path d="M4 20V6l8-3 8 3v14"/><path d="M8 9h8M8 13h8M8 17h8"/></svg>
  if(href==='/availability') return <svg {...common}><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8.5"/></svg>
  if(href==='/roles') return <svg {...common}><circle cx="8" cy="8" r="3"/><path d="M3 20c.4-4 2.1-6 5-6s4.6 2 5 6"/><path d="M16 7h5M16 11h5M16 15h5"/></svg>
  if(href==='/backtest') return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/><path d="m4 14 6-4 6 2 6-6"/></svg>
  if(href==='/pricing') return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-5"/></svg>
  if(href==='/profile') return <svg {...common}><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-4.2 2.8-6.3 6.5-6.3s5.9 2.1 6.5 6.3"/></svg>
  if(href==='/sss') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.7 2.7 0 1 1 4.2 2.25c-1.15.72-1.8 1.17-1.8 2.25"/><path d="M12 17h.01"/></svg>
  if(href==='/login') return <svg {...common}><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 4h6v16h-6"/></svg>
  return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/></svg>
}

function MenuRow({ href,label,onClick,active=false,prefetch }){
  return <Link prefetch={prefetch} onClick={onClick} className={active?'active mobile-menu-row':'mobile-menu-row'} href={href}>
    <span className="mobile-menu-row-icon"><MenuIcon href={href}/></span>
    <span>{label}</span>
  </Link>
}

export function MobileMenu({ primary, analysis }){
  const [auth,setAuth]=useState({loaded:false,signedIn:false,email:null})
  const [signingOut,setSigningOut]=useState(false)
  const path=usePathname()
  const [open,setOpen]=useState(false)
  const wrapRef=useRef(null)

  useEffect(()=>setOpen(false),[path])
  useEffect(()=>{
    if(!open)return
    const supabase=createClient()
    let alive=true
    const sync=async()=>{const {data:{session}}=await supabase.auth.getSession();if(alive)setAuth({loaded:true,signedIn:Boolean(session?.user),email:session?.user?.email||null})}
    sync()
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive)setAuth({loaded:true,signedIn:Boolean(session?.user),email:session?.user?.email||null})})
    return()=>{alive=false;data.subscription.unsubscribe()}
  },[open])


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
  const handleLogout=async()=>{
    if(signingOut)return
    setSigningOut(true)
    const supabase=createClient()
    const {error}=await supabase.auth.signOut({scope:'local'})
    if(error){
      setSigningOut(false)
      return
    }
    setAuth({loaded:true,signedIn:false,email:null})
    setOpen(false)
    window.location.replace('/')
  }


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
      {primary.map(([href,label])=>
        <MenuRow onClick={close} active={matches(path,href)} key={href} href={href} label={label}/>
      )}
      <MenuRow onClick={close} active={matches(path,'/squad')} href="/squad" label="Benim Kadrom"/>
      {visibleAnalysis(analysis,auth.email).map(([href,label])=>
        <MenuRow onClick={close} active={matches(path,href)} key={href} href={href} label={label} prefetch={false}/>
      )}
      <MenuRow onClick={close} href="/pricing" label="Gelişmiş Üyelik"/>
      {auth.loaded&&auth.signedIn?<MenuRow onClick={close} active={matches(path,'/profile')} href="/profile" label="Profilim"/>:null}
      {!auth.loaded?null:auth.signedIn
        ? <button className="mobile-menu-row mobile-menu-logout" onClick={handleLogout} type="button" disabled={signingOut}><span className="mobile-menu-row-icon"><MenuIcon href="/login"/></span><span>{signingOut?'Çıkılıyor…':'Çıkış'}</span></button>
        : <MenuRow onClick={close} href="/login" label="Giriş / Kayıt"/>}
    </div>:null}
  </div>
}

function BottomNavIcon({ name }){
  const common={width:22,height:22,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true}
  if(name==='home') return <svg {...common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>
  if(name==='players') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.3-6 5.5-6s5.1 2 5.5 6"/><circle cx="17.5" cy="9" r="2.2"/><path d="M15.5 14.5c3.1-.4 5 1.3 5.3 4.5"/></svg>
  if(name==='matches') return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="m8.7 9.4 3.3-2.1 3.3 2.1-1.2 3.8H9.9z"/><path d="m8.7 9.4-3.4.1M15.3 9.4l3.4.1M9.9 13.2l-1.6 3.4M14.1 13.2l1.6 3.4"/></svg>
  if(name==='recommendations') return <svg {...common}><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m16.5 15.5 1 1 2-2"/></svg>
  return <svg {...common}><path d="M5 6.5 8.2 4 12 6l3.8-2L19 6.5V20H5z"/><path d="M8.2 4 9 9h6l.8-5"/><path d="M9 13h6"/></svg>
}

export function MobileBottomNav({ items }){
  const path=usePathname()
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
    {items.map(([href,icon,label])=>
      <Link className={matches(path,href)?'active':''} href={href} key={href}>
        <span className="bottom-nav-icon"><BottomNavIcon name={icon}/></span>
        <b>{label}</b>
      </Link>
    )}
  </nav>
}
