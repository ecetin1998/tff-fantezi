import {login,signup,resendConfirmation,requestPasswordReset} from '@/app/actions'

export const metadata={title:'Giriş'}

const ERRORS={
  invalid_credentials:'E-posta veya şifre hatalı.',
  email_not_confirmed:'E-posta adresini doğrulaman gerekiyor.',
  already_registered:'Bu e-posta adresi zaten kayıtlı.',
  weak_password:'Şifre en az 8 karakter olmalı.',
  leaked_password:'Bu şifre bilinen veri sızıntılarında yer alıyor. Başka bir şifre seç.',
  password_check_failed:'Şifre güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
  rate_limited:'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
  auth_failed:'İşlem tamamlanamadı. Lütfen tekrar dene.',
  email_required:'E-posta adresini gir.',
}
const MESSAGES={
  check_email:'Doğrulama e-postasını kontrol et. Mail gelmezse aşağıdan tekrar gönderebilirsin.',
  resend_sent:'Doğrulama e-postası tekrar gönderildi. Gelen kutusu ve spam klasörünü kontrol et.',
  reset_sent:'Şifre yenileme bağlantısı gönderildi. E-posta kutunu kontrol et.',
  password_updated:'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.',
  pro_login_required:'Pro talebini kaydetmek için giriş yap.',
}

export default async function Login({searchParams}){
  const sp=await searchParams
  const error=ERRORS[String(sp?.error||'')]||null
  const message=MESSAGES[String(sp?.message||'')]||null
  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESABIN</span><h1>Giriş yap</h1><p>Kadronu kaydet, her hafta modelle karşılaştır.</p>
    {error?<div className="alert error">{error}</div>:null}
    {message?<div className="alert">{message}</div>:null}
    <form className="auth-form">
      <label>E-posta<input name="email" type="email" autoComplete="email" required/></label>
      <label>Şifre<input name="password" type="password" autoComplete="current-password" minLength="6" required/></label>
      <div className="auth-actions">
        <button formAction={login} className="cta">Giriş yap</button>
        <button formAction={signup} className="secondary">Hesap oluştur</button>
      </div>
    </form>
    <div className="auth-resend">
      <span>Şifreni mi unuttun?</span>
      <form action={requestPasswordReset}>
        <input name="email" type="email" autoComplete="email" placeholder="E-posta adresin" required/>
        <button className="ghost-btn" type="submit">Şifre yenileme bağlantısı gönder</button>
      </form>
    </div>
    <div className="auth-resend">
      <span>Hesabın oluştu ama doğrulama maili gelmedi mi?</span>
      <form action={resendConfirmation}>
        <input name="email" type="email" autoComplete="email" placeholder="E-posta adresin" required/>
        <button className="ghost-btn" type="submit">Doğrulama mailini tekrar gönder</button>
      </form>
    </div>
  </div></div>
}
