import Link from 'next/link'
import { joinProWaitlist } from '@/app/actions'
import { getAuthState } from '@/lib/data'
import {createClient} from '@/lib/supabase/server'

export const metadata={title:'Gelişmiş Üyelik'}

export default async function Pricing({searchParams}){
  const [auth,sp]=await Promise.all([getAuthState(),searchParams])
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  const {data:verification}=user?await supabase.from('scout_email_verifications').select('email').eq('user_id',user.id).maybeSingle():{data:null}
  const emailVerified=Boolean(verification?.email && verification.email===user?.email)
  return <div className="pricing access-pricing">
    <div className="section-title centered"><div>
      <span className="eyebrow">ERİŞİM SEVİYELERİ</span>
      <h1>Ziyaret et, ücretsiz üye ol, ihtiyacın olursa Gelişmiş üyeliğe geç.</h1>
      <p className="muted">Temel analiz herkese açık. Hesap açınca kadronu kaydedersin; gelişmiş üyelik, tavan ve gelişmiş karar katmanlarını açar.</p>
    </div></div>

    {sp?.launch==='activated'?<div className="alert">Tebrikler! İlk 100 kullanıcı kampanyasıyla Gelişmiş üyeliğin ücretsiz olarak açıldı.</div>:null}
    {sp?.launch==='verify_email'?<div className="alert">İlk 100 kontenjanında yerin ayrıldı. Gelişmiş üyeliğini açmak için <Link href="/profile">e-posta adresini doğrula</Link>.</div>:null}
    {sp?.launch==='full'?<div className="alert">İlk 100 kişilik ücretsiz kontenjan doldu. Talebin bekleme listesine alındı.</div>:null}
    {sp?.joined?<div className="alert">Gelişmiş üyelik listesine eklendin. Ücretli üyelik açıldığında ilk haber alanlardan olacaksın.</div>:null}
    {sp?.error==='waitlist_failed'?<div className="alert error">Gelişmiş üyelik talebi şu anda kaydedilemedi. Lütfen tekrar dene.</div>:null}

    <div className="access-tier-grid">
      <article className="card access-tier-card">
        <span>ZİYARETÇİ</span><strong>0 TL</strong>
        <p>Siteyi hesap açmadan incele ve modelin nasıl çalıştığını gör. Oyuncu ve maç ekranlarında sınırlı ama gerçek bir önizleme açık kalır.</p>
        <ul>
          <li>Oyuncu Analizi: xFP'ye göre ilk 15 oyuncu</li>
          <li>Maç Tahminleri: haftanın 1 öne çıkan maçı</li>
          <li>Sakatlık-ceza ve kadro önerisi önizlemeleri</li>
          <li>Benim Kadrom kapalı</li>
        </ul>
        <Link href="/players" className="secondary">Siteyi incele</Link>
      </article>

      <article className="card access-tier-card member">
        <span>ÜCRETSİZ ÜYE</span><strong>0 TL</strong>
        <p>Ziyaretçideki her şeye ek olarak kişisel kadronu kur, kaydet ve modelin dengeli önerisini kullan.</p>
        <ul>
          <li>Tüm oyuncu havuzu, arama ve filtreler</li>
          <li>Tüm maç tahminleri ve fantezi yorumları</li>
          <li>Benim Kadrom • 15 oyuncu / 100m</li>
          <li>Tam Önerilen Kadro ve sakatlık / ceza görünümü</li>
        </ul>
        {auth.tier==='visitor'?<Link href="/login" className="cta">Ücretsiz hesap aç</Link>:<div className="access-current-plan">Aktif seviyen</div>}
      </article>

      <article className="card access-tier-card pro featured">
        <span>GELİŞMİŞ ÜYELİK</span><strong>İlk 100'e ücretsiz<small> • lansman kampanyası</small></strong>
        <p>Ortalama beklentinin ötesine geç: tavan, risk, rol ve gelişmiş eşleşme katmanlarını aç.</p>
        <ul>
          <li>P25 / P75 / P90 ve 6+ ihtimali</li>
          <li>xG / xA ve gelişmiş rol-dakika analizi</li>
          <li>Agresif 11 ve İlk 25/tavan katmanı</li>
          <li>Menajer kartı optimizasyonu • öneriler + Benim Kadrom</li>
          <li>Gelişmiş takım/rakip eşleşmeleri</li>
          <li>Çok haftalı transfer planlayıcı (geliştirme aşamasında)</li>
        </ul>
        {auth.userId && !emailVerified?<p className="muted">İlk 100 kampanyası kapsamında Gelişmiş üyelik etkinleştirilmeden önce <Link href="/profile">e-posta adresini doğrulaman</Link> gerekecek. Bekleme listesine şimdi katılabilirsin.</p>:null}
        {auth.plan==='pro'
          ?<div className="access-current-plan pro">GELİŞMİŞ aktif ✓</div>
          :auth.userId
            ?<form action={joinProWaitlist}><button className="cta">İlk 100'e katıl • ücretsiz</button></form>
            :<Link href="/login?message=pro_login_required" className="cta">Giriş yap ve Gelişmiş üyelik talebi bırak</Link>}
      </article>
    </div>
  </div>
}
