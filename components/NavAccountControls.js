'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {createClient} from '@/lib/supabase/client'

export default function NavAccountControls(){
  const [state,setState]=useState({loaded:false,signedIn:false,pro:false})
  const [signingOut,setSigningOut]=useState(false)
  useEffect(()=>{
    const supabase=createClient()
    let alive=true
    const refresh=async()=>{
      const {data:{session}}=await supabase.auth.getSession()
      const user=session?.user||null
      let pro=false
      if(user){
        const {data:sub}=await supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',user.id).maybeSingle()
        pro=sub?.plan==='pro'&&['active','trialing'].includes(sub?.status)&&(!sub?.valid_until||new Date(sub.valid_until)>new Date())
      }
      if(alive)setState({loaded:true,signedIn:Boolean(user),pro})
    }
    refresh()
    const {data}=supabase.auth.onAuthStateChange(()=>refresh())
    return()=>{alive=false;data.subscription.unsubscribe()}
  },[])
  const handleLogout=async()=>{
    if(signingOut)return
    setSigningOut(true)
    const supabase=createClient()
    const {error}=await supabase.auth.signOut({scope:'local'})
    if(error){
      setSigningOut(false)
      return
    }
    setState({loaded:true,signedIn:false,pro:false})
    window.location.replace('/')
  }

  return <>
    <Link href="/pricing" className="pro-btn">{state.pro?'PRO ✓':'PRO'}</Link>
    {!state.loaded
      ?<span className="ghost-btn desktop-auth" aria-hidden="true">•••</span>
      :state.signedIn
        ?<>
          <Link className="ghost-btn desktop-auth" href="/profile">Profilim</Link>
          <button className="ghost-btn desktop-auth" type="button" onClick={handleLogout} disabled={signingOut}>{signingOut?'Çıkılıyor…':'Çıkış'}</button>
        </>
        :<Link className="ghost-btn desktop-auth" href="/login">Giriş</Link>}
  </>
}
