'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {createClient} from '@/lib/supabase/client'

export default function NavAccountControls(){
  const [state,setState]=useState({loaded:false,signedIn:false})
  const [signingOut,setSigningOut]=useState(false)

  useEffect(()=>{
    const supabase=createClient()
    let alive=true
    let currentUserId=null

    const applySession=session=>{
      const userId=session?.user?.id||null
      if(currentUserId===userId&&alive&&state.loaded)return
      currentUserId=userId
      if(alive)setState({loaded:true,signedIn:Boolean(userId)})
    }

    supabase.auth.getSession().then(({data})=>applySession(data.session))
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='INITIAL_SESSION'&&currentUserId===session?.user?.id)return
      applySession(session)
    })
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
    setState({loaded:true,signedIn:false})
    window.location.replace('/')
  }

  return <>
    <Link href="/pricing" className="pro-btn">GELİŞMİŞ</Link>
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
