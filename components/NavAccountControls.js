'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {createClient} from '@/lib/supabase/client'

const PLAN_CACHE_MS=60000
const planCacheKey=userId=>'flr:plan:'+userId

function cachedPlan(userId){
  try{
    const value=JSON.parse(sessionStorage.getItem(planCacheKey(userId))||'null')
    if(value&&Date.now()-Number(value.at||0)<PLAN_CACHE_MS)return Boolean(value.pro)
  }catch{}
  return null
}
function storePlan(userId,pro){
  try{sessionStorage.setItem(planCacheKey(userId),JSON.stringify({pro:Boolean(pro),at:Date.now()}))}catch{}
}

export default function NavAccountControls(){
  const [state,setState]=useState({loaded:false,signedIn:false,pro:false})
  const [signingOut,setSigningOut]=useState(false)
  useEffect(()=>{
    const supabase=createClient()
    let alive=true
    let currentUserId=null

    const applySession=async(session,{force=false}={})=>{
      const user=session?.user||null
      if(!user){
        currentUserId=null
        if(alive)setState({loaded:true,signedIn:false,pro:false})
        return
      }
      if(!force&&currentUserId===user.id)return
      currentUserId=user.id
      let pro=force?null:cachedPlan(user.id)
      if(pro===null){
        const {data:sub}=await supabase.from('scout_subscriptions').select('plan,status,valid_until').eq('user_id',user.id).maybeSingle()
        pro=sub?.plan==='pro'&&['active','trialing'].includes(sub?.status)&&(!sub?.valid_until||new Date(sub.valid_until)>new Date())
        storePlan(user.id,pro)
      }
      if(alive)setState({loaded:true,signedIn:true,pro:Boolean(pro)})
    }

    supabase.auth.getSession().then(({data})=>applySession(data.session))
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='INITIAL_SESSION'&&currentUserId===session?.user?.id)return
      applySession(session,{force:event==='SIGNED_IN'})
    })
    return()=>{alive=false;data.subscription.unsubscribe()}
  },[])

  const handleLogout=async()=>{
    if(signingOut)return
    setSigningOut(true)
    const supabase=createClient()
    const {data:{session}}=await supabase.auth.getSession()
    if(session?.user?.id){
      try{sessionStorage.removeItem(planCacheKey(session.user.id))}catch{}
    }
    const {error}=await supabase.auth.signOut({scope:'local'})
    if(error){
      setSigningOut(false)
      return
    }
    setState({loaded:true,signedIn:false,pro:false})
    window.location.replace('/')
  }

  return <>
    <Link href="/pricing" className="pro-btn">{state.pro?'GELİŞMİŞ ✓':'GELİŞMİŞ'}</Link>
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
