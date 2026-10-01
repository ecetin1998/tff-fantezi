import Link from 'next/link'
import AccessGate from '@/components/AccessGate'
import {getAuthState} from '@/lib/data'

export const metadata={
  title:'Profilim',
  description:'Hesap bilgilerini ve Fantezi üyelik seviyeni görüntüle.'
}

const dummyAliases={
  'dummy.free.20261001@example.com':'adminfree',
  'dummy.pro.20261001@example.com':'adminpro',
}

export default async function Profile(){
  const auth=await getAuthState()

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

  const isPro=auth.plan==='pro'
  const accountName=dummyAliases[auth.email]||auth.email?.split('@')[0]||'Kullanıcı'
  const features=isPro
    ?['Tüm oyuncu havuzu ve maç tahminleri','Benim Kadrom ve tam Önerilen Kadro','P25 / P75 / P90 ve 6+ ihtimali','xG / xA ve gelişmiş rol-dakika analizi','Agresif 11 ve gelişmiş takım eşleşmeleri']
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

    <div className="profile-actions">
      <Link className="cta" href="/squad">Benim Kadrom</Link>
      <Link className="secondary" href="/players">Oyuncu Analizi</Link>
      {!isPro?<Link className="secondary" href="/pricing">Gelişmiş özellikleri gör</Link>:null}
    </div>
  </div>
}
