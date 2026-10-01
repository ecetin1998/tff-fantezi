import Link from 'next/link'
import {requestPasswordReset} from '@/app/actions'

export const metadata={
  title:'Şifremi Unuttum',
  robots:{index:false,follow:false},
}

const ERRORS={
  email_required:'E-posta adresini gir.',
  rate_limited:'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
  auth_failed:'Şifre yenileme bağlantısı gönderilemedi. Lütfen tekrar dene.',
}
const MESSAGES={
  reset_sent:'Şifre yenileme bağlantısı gönderildi. E-posta kutunu ve gereksiz klasörünü kontrol et.',
}

export default async function ForgotPassword({searchParams}){
  const sp=await searchParams
  const error=ERRORS[String(sp?.error||'')]||null
  const message=MESSAGES[String(sp?.message||'')]||null

  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">ŞİFRE YENİLEME</span>
    <h1>Şifremi unuttum</h1>
    <p>Hesabına bağlı e-posta adresini gir. Yeni şifre belirleyebileceğin güvenli bağlantıyı e-postayla göndereceğiz.</p>
    {error?<div className="alert error">{error}</div>:null}
    {message?<div className="alert">{message}</div>:null}
    <form className="auth-form" action={requestPasswordReset}>
      <label>E-posta<input name="email" type="email" autoComplete="email" placeholder="E-posta adresin" required/></label>
      <button className="cta" type="submit">Şifre yenileme bağlantısı gönder</button>
    </form>
    <div className="auth-link-stack">
      <Link href="/login">← Giriş ekranına dön</Link>
    </div>
  </div></div>
}