import Link from 'next/link'
import { getAuthState } from '@/lib/data'
import { logout } from '@/app/actions'

const links = [
  ['/', 'Özet'],
  ['/players', 'Oyuncular'],
  ['/teams', 'Takım & Fikstür'],
  ['/matches', 'Maç Tahminleri'],
  ['/squads', 'Kadrolar'],
  ['/availability', 'Sakatlık & Ceza'],
  ['/roles', 'Rol Takibi'],
  ['/model', 'Model & Güven'],
  ['/squad', 'Benim Kadrom'],
]

export default async function Nav(){
  const auth = await getAuthState()
  return <header className="topbar">
    <Link href="/" className="brand"><span className="brand-mark">FS</span><span>Fantezi Scout</span><span className="beta">BETA</span></Link>
    <nav className="desktop-nav">
      {links.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}
    </nav>
    <div className="nav-actions">
      <Link href="/pricing" className="pro-btn">Scout Pro</Link>
      {auth.userId ? <form className="desktop-auth" action={logout}><button className="ghost-btn" type="submit">Çıkış</button></form> : <Link className="ghost-btn desktop-auth" href="/login">Giriş</Link>}
      <details className="mobile-menu">
        <summary aria-label="Menüyü aç">☰</summary>
        <div className="mobile-menu-panel">
          {links.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}
          <Link href="/pricing">Scout Pro</Link>
          {auth.userId ? <form action={logout}><button type="submit">Çıkış</button></form> : <Link href="/login">Giriş / Kayıt</Link>}
        </div>
      </details>
    </div>
  </header>
}