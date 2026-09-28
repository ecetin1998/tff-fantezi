import {Suspense} from 'react'
import LoginForm from '@/components/LoginForm'

export const metadata={title:'Giriş'}
export const dynamic='force-static'

export default function Login(){
  return <Suspense fallback={<div className="auth-wrap"><div className="card auth-card"><span className="eyebrow">HESABIN</span><h1>Giriş yap</h1></div></div>}>
    <LoginForm/>
  </Suspense>
}
