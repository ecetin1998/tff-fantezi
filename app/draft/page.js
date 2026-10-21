import Link from 'next/link'
import DraftRoom from '@/components/DraftRoom'
import {getAuthState} from '@/lib/data'

export const metadata={title:'Canlı Draft Odası'}
export const dynamic='force-dynamic'

export default async function DraftPage({searchParams}){
  const [auth,params]=await Promise.all([getAuthState(),searchParams])
  if(!auth?.userId) return <section className="auth-wrap">
    <div className="card auth-card">
      <span className="eyebrow">4 KİŞİLİK CANLI DRAFT</span>
      <h1>Arkadaşlarınla aynı draft odasına gir.</h1>
      <p>Oda oluşturmak, davet koduyla katılmak ve seçim yapmak için ücretsiz üyelik yeterli.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <Link className="cta" href="/login">Giriş yap</Link>
        <Link className="secondary" href="/signup">Ücretsiz üye ol</Link>
      </div>
    </div>
  </section>
  return <DraftRoom initialRoom={typeof params?.room==='string'?params.room:''}
    initialInvite={typeof params?.join==='string'?params.join:''}/>
}
