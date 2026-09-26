'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {logout} from '@/app/actions'

export default function NavAccountControls(){
  const [state,setState]=useState({loaded:false,signedIn:false,pro:false})
  useEffect(()=>{
    const supabase=createClient()
    let alive=true
    const refresh=async()=>{
      const {data:{user}}=await supabase.auth.getUser()
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
  return <>
    <Link href="/pricing" className="pro-btn">{state.pro?'PRO ✓':'PRO'}</Link>
    {state.loaded&&state.signedIn
      ?<form className="desktop-auth" action={logout}><button className="ghost-btn" type="submit">Çıkış</button></form>
      :<Link className="ghost-btn desktop-auth" href="/login">Giriş</Link>}
  </>
}
