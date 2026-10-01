import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import {getAuthState} from '@/lib/data'

export const metadata={title:'Giriş'}
export const dynamic='force-dynamic'

export default async function Login(){
  const auth=await getAuthState()
  if(auth.signedIn)redirect('/')
  return <Suspense fallback={<div className="auth-wrap"><div className="card auth-card"><span className="eyebrow">HESABIN</span><h1>Giriş yap</h1></div></div>}>
    <LoginForm/>
  </Suspense>
}
