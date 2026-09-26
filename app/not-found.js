import Link from 'next/link'
export const metadata={title:'Sayfa bulunamadı'}
export default function NotFound(){
  return <div className="auth-wrap"><div className="card auth-card"><span className="eyebrow">404</span><h1>Sayfa bulunamadı</h1><p>Aradığın sayfa kaldırılmış, taşınmış veya hiç var olmamış olabilir.</p><Link className="cta" href="/">Ana sayfaya dön</Link></div></div>
}
