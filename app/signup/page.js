import Link from 'next/link'
import {resendConfirmation,signup} from '@/app/actions'

export const metadata={
  title:'Hesap Oluştur',
  robots:{index:false,follow:false},
}

const ERRORS={
  email_required:'Geçerli bir e-posta adresi gir.',
  already_registered:'Bu e-posta adresi zaten kayıtlı.',
  weak_password:'Şifre en az 8 karakter olmalı.',
  leaked_password:'Bu şifre bilinen veri sızıntılarında yer alıyor. Başka bir şifre seç.',
  password_check_failed:'Şifre güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
  rate_limited:'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
  auth_failed:'İşlem tamamlanamadı. Lütfen tekrar dene.',
}
const MESSAGES={
  check_email:'Hesabın oluşturuldu. Doğrulama e-postasını kontrol et; gelen kutusunda yoksa aşağıdan tekrar gönderebilirsin.',
  resend_sent:'Doğrulama e-postası tekrar gönderildi. Gelen kutusu ve spam klasörünü kontrol et.',
}

export default async function Signup({searchParams}){
  const sp=await searchParams
  const error=ERRORS[String(sp?.error||'')]||null
  const message=MESSAGES[String(sp?.message||'')]||null

  return <div className="auth-wrap"><div className="card auth-card auth-card-wide">
    <span className="eyebrow">YENİ HESAP</span>
    <h1>Hesap oluştur</h1>
    <p>Ücretsiz hesabını oluştur; tüm temel oyuncu ve maç analizlerini, Benim Kadrom'u ve kişisel özellikleri aç.</p>
    {error?<div className="alert error">{error}</div>:null}
    {message?<div className="alert">{message}</div>:null}

    <form className="auth-form" action={signup}>
      <label>E-posta<input name="email" type="email" autoComplete="email" placeholder="E-posta adresin" required/></label>
      <label>Şifre<input name="password" type="password" autoComplete="new-password" minLength="8" required/></label>
      <button className="cta" type="submit">Hesap oluştur</button>
    </form>

    <div className="auth-link-stack">
      <span>Zaten hesabın var mı? <Link href="/login">Giriş yap</Link></span>
    </div>

    <section className="auth-utility-section" id="verification">
      <span className="eyebrow">DOĞRULAMA E-POSTASI</span>
      <h2>Doğrulama maili gelmedi mi?</h2>
      <p>Hesabı oluştururken kullandığın e-posta adresini gir; yeni doğrulama bağlantısı gönderelim.</p>
      <form className="auth-form" action={resendConfirmation}>
        <label>E-posta<input name="email" type="email" autoComplete="email" placeholder="E-posta adresin" required/></label>
        <button className="secondary" type="submit">Doğrulama mailini tekrar gönder</button>
      </form>
    </section>
  </div></div>
}