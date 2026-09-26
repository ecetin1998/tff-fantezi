import ResetPasswordForm from '@/components/ResetPasswordForm'

export const metadata={title:'Şifre Yenile'}

const ERRORS={
  weak_password:'Şifre en az 8 karakter olmalı.',
  leaked_password:'Bu şifre bilinen veri sızıntılarında yer alıyor. Başka bir şifre seç.',
  password_check_failed:'Şifre güvenlik kontrolü tamamlanamadı. Lütfen tekrar dene.',
  password_mismatch:'Şifreler eşleşmiyor.',
  same_password:'Yeni şifre eskisiyle aynı olamaz.',
  auth_failed:'Şifre güncellenemedi. Bağlantıyı yeniden isteyip tekrar dene.',
}

export default async function ResetPassword({searchParams}){
  const sp=await searchParams
  const error=ERRORS[String(sp?.error||'')]||null
  return <div className="auth-wrap"><div className="card auth-card">
    <span className="eyebrow">ŞİFRE YENİLE</span>
    <h1>Yeni şifreni belirle</h1>
    <p>E-postadaki yenileme bağlantısını doğruladıktan sonra yeni şifreni kaydedebilirsin.</p>
    <ResetPasswordForm serverError={error}/>
  </div></div>
}
