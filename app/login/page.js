import { login, signup, resendConfirmation } from '@/app/actions'

export const metadata={title:'Giriş'}
export default async function Login({searchParams}){
  const sp=await searchParams
  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">HESABIN</span><h1>Giriş yap</h1><p>Kadronu kaydet, her hafta modelle karşılaştır.</p>
    {sp?.error?<div className="alert error">{sp.error}</div>:null}
    {sp?.message?<div className="alert">{sp.message}</div>:null}
    <form className="auth-form">
      <label>E-posta<input name="email" type="email" required/></label>
      <label>Şifre<input name="password" type="password" minLength="6" required/></label>
      <div className="auth-actions">
        <button formAction={login} className="cta">Giriş yap</button>
        <button formAction={signup} className="secondary">Hesap oluştur</button>
      </div>
    </form>
    <div className="auth-resend">
      <span>Hesabın oluştu ama doğrulama maili gelmedi mi?</span>
      <form action={resendConfirmation}>
        <input name="email" type="email" placeholder="E-posta adresin" required/>
        <button className="ghost-btn" type="submit">Doğrulama mailini tekrar gönder</button>
      </form>
    </div>
  </div></div>
}