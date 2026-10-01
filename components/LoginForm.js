'use client'
import Link from 'next/link'
import {useSearchParams} from 'next/navigation'
import {login} from '@/app/actions'

const ERRORS={
  invalid_credentials:'Kullanıcı adı/e-posta veya şifre hatalı.',
  email_not_confirmed:'E-posta adresini doğrulaman gerekiyor. Yeni doğrulama mailini Hesap Oluştur sayfasından isteyebilirsin.',
  rate_limited:'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
  auth_failed:'Giriş tamamlanamadı. Lütfen tekrar dene.',
}
const MESSAGES={
  password_updated:'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.',
  pro_login_required:'Pro talebini kaydetmek için giriş yap.',
}

export default function LoginForm(){
  const sp=useSearchParams()
  const error=ERRORS[String(sp.get('error')||'')]||null
  const message=MESSAGES[String(sp.get('message')||'')]||null
  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESABIN</span>
    <h1>Giriş yap</h1>
    <p>Hesabına gir ve kaldığın yerden devam et.</p>
    {error?<div className="alert error">{error}</div>:null}
    {message?<div className="alert">{message}</div>:null}
    <form className="auth-form" action={login}>
      <label>E-posta / kullanıcı adı<input name="email" type="text" autoComplete="username" placeholder="E-posta veya kullanıcı adı" required/></label>
      <label>Şifre<input name="password" type="password" autoComplete="current-password" minLength="6" required/></label>
      <button className="cta" type="submit">Giriş yap</button>
    </form>
    <div className="auth-link-stack">
      <Link href="/forgot-password">Şifremi unuttum</Link>
      <span>Hesabın yok mu? <Link href="/signup">Hesap oluştur</Link></span>
      {String(sp.get('error')||'')==='email_not_confirmed'
        ?<span>Doğrulama maili gelmediyse <Link href="/signup#verification">tekrar gönder</Link>.</span>
        :null}
    </div>
  </div></div>
}