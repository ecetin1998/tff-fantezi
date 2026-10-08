import Link from 'next/link'
import AccessGate from '@/components/AccessGate'
import ProfilePasswordForm from '@/components/ProfilePasswordForm'
import {sendProfileEmailVerification} from '@/app/actions'
import {createClient} from '@/lib/supabase/server'
import {getAuthState} from '@/lib/data'

export const metadata={
  title:'Profilim',
  description:'Hesap bilgilerini ve Fantezi üyelik seviyeni görüntüle.'
}

const dummyAliases={
  'dummy.free.20261001@example.com':'adminfree',
  'dummy.pro.20261001@example.com':'adminpro',
}

export default async function Profile({searchParams}){
  const [auth,sp]=await Promise.all([getAuthState(),searchParams])

  if(!auth.signedIn){
    return <div className="profile-page">
      <div className="section-title">
        <div><span className="eyebrow">HESABIM</span><h1>Profilim</h1></div>
      </div>
      <AccessGate
        tier="member"
        eyebrow="ÜYELİK"
        title="Profilini görmek için giriş yap."
        description="Hesap bilgilerin, Ücretsiz/Gelişmiş üyelik seviyen ve üyeliğine açık özellikler burada görünür."
      />
    </div>
  }

  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  const {data:verification}=user?await supabase.from('scout_email_verifications').select('email').eq('user_id',user.id).maybeSingle():{data:null}
  const emailVerified=Boolean(verification?.email && verification.email===user?.email)
  const verificationMessage={sent:'Doğrulama bağlantısı e-posta adresine gönderildi.',success:'E-posta adresin doğrulandı.',already:'E-posta adresin zaten doğrulanmış.',invalid:'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı iste.',send_failed:'E-posta gönderilemedi. Biraz sonra tekrar dene.',configuration:'Doğrulama henüz yapılandırılmadı.',save_failed:'Doğrulama kaydedilemedi. Lütfen tekrar dene.'}[String(sp?.verification||'')]
  const isPro=auth.plan==='pro'
  const accountName=dummyAliases[auth.email]||auth.email?.split('@')[0]||'Kullanıcı'
  const features=isPro
    ?['Tüm oyuncu havuzu ve maç tahminleri','Benim Kadrom ve tam Önerilen Kadro','P25 / P75 / P90 ve 6+ ihtimali','xG / xA ve gelişmiş rol-dakika analizi','Agresif 11 ve gelişmiş takım eşleşmeleri','Menajer kartı optimizasyonu ve kartlı hafta hesabı']
    :['Tüm oyuncu havuzu ve filtreler','Tüm maç tahminleri ve fantezi yorumları','Benim Kadrom • 15 oyuncu / 100m','Tam Önerilen Kadro','Tam sakatlık / ceza görünümü']

  return <div className="profile-page">
    <div className="section-title">
      <div><span className="eyebrow">HESABIM</span><h1>Profilim</h1></div>
      <span className={isPro?'profile-plan-badge pro':'profile-plan-badge'}>{isPro?'GELİŞMİŞ':'ÜCRETSİZ'}</span>
    </div>

    <div className="profile-grid">
      <section className="card profile-card">
        <span className="eyebrow">KULLANICI BİLGİLERİ</span>
        <div className="profile-info-list">
          <div className="profile-info-row"><span>Kullanıcı</span><b>{accountName}</b></div>
          <div className="profile-info-row"><span>E-posta</span><b>{auth.email||'—'}</b></div>
          <div className="profile-info-row"><span>E-posta doğrulaması</span><b>{emailVerified?'Doğrulandı':'Doğrulanmadı'}</b></div>
          <div className="profile-info-row"><span>Hesap durumu</span><b className="profile-active">Aktif</b></div>
          <div className="profile-info-row"><span>Üyelik</span><b>{isPro?'Gelişmiş üyelik':'Ücretsiz üye'}</b></div>
        </div>
      </section>

      <section className="card profile-card">
        <span className="eyebrow">{isPro?'GELİŞMİŞ ERİŞİM':'ÜCRETSİZ ERİŞİM'}</span>
        <h2>{isPro?'Gelişmiş analizlerin açık.':'Temel üyelik özelliklerin açık.'}</h2>
        <ul className="profile-feature-list">{features.map(item=><li key={item}>{item}</li>)}</ul>
      </section>
    </div>

    <section className="card profile-card" style={{marginTop:16}}>
      <span className="eyebrow">E-POSTA GÜVENLİĞİ</span>
      <h2>{emailVerified?"E-posta adresin doğrulandı":"E-posta adresin henüz doğrulanmadı"}</h2>
      <p className="muted">{emailVerified?"Pro üyelik için e-posta doğrulaman hazır.":"Ücretsiz üyeliğini kullanmaya devam edebilirsin. Pro üyelik için e-posta adresini doğrulaman gerekecek."}</p>
      {verificationMessage?<p role="status">{verificationMessage}</p>:null}
      {!emailVerified?<form action={sendProfileEmailVerification}><button className="secondary" type="submit">E-postamı doğrula</button></form>:null}
    </section>

    <section className="card profile-card" style={{marginTop:16}}>
      <span className="eyebrow">GÜVENLİK</span>
      <h2>Şifre değiştir</h2>
      <p className="muted">Yeni şifreni belirle. Değişiklik hesabında hemen geçerli olur.</p>
      <ProfilePasswordForm/>
    </section>

    <div className="profile-actions">
      <Link className="cta" href="/squad">Benim Kadrom</Link>
      <Link className="secondary" href="/players">Oyuncu Analizi</Link>
      {!isPro?<Link className="secondary" href="/pricing">Gelişmiş özellikleri gör</Link>:null}
    </div>
  </div>
}
