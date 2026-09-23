import Link from 'next/link'
import { getAuthState } from '@/lib/data'
import { logout } from '@/app/actions'

const primary = [
  ['/', 'Özet'],
  ['/players', 'Oyuncular'],
  ['/points', 'Puanlar'],
  ['/matches', 'Maçlar'],
  ['/squads', 'Kadrolar'],
]

const analysis = [
  ['/teams', 'Takım & Fikstür'],
  ['/availability', 'Sakatlık & Ceza'],
  ['/roles', 'Rol Takibi'],
  ['/model', 'Model & Güven'],
]

const bottom = [
  ['/', '⌂', 'Ana'],
  ['/players', '◉', 'Oyuncu'],
  ['/matches', '◎', 'Maç'],
  ['/squads', '▦', 'Kadro'],
  ['/squad', '◇', 'Benim'],
]

export default async function Nav(){
  const auth = await getAuthState()
  return <>
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">FS</span>
        <span className="brand-copy"><b>Fantezi Scout</b><small>Süper Lig analiz merkezi</small></span>
        <span className="beta">BETA</span>
      </Link>

      <nav className="desktop-nav">
        {primary.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}
        <details className="desktop-more">
          <summary>Analizler <span>⌄</span></summary>
          <div className="desktop-more-panel">
            {analysis.map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}
          </div>
        </details>
      </nav>

      <div className="nav-actions">
        <Link href="/squad" className="my-team-btn">Benim Kadrom</Link>
        <Link href="/pricing" className="pro-btn">PRO</Link>
        {auth.userId
          ? <form className="desktop-auth" action={logout}><button className="ghost-btn" type="submit">Çıkış</button></form>
          : <Link className="ghost-btn desktop-auth" href="/login">Giriş</Link>}
        <details className="mobile-menu">
          <summary aria-label="Menüyü aç">☰</summary>
          <div className="mobile-menu-panel">
            {[...primary,...analysis].map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}
            <Link href="/pricing">Scout Pro</Link>
            {auth.userId ? <form action={logout}><button type="submit">Çıkış</button></form> : <Link href="/login">Giriş / Kayıt</Link>}
          </div>
        </details>
      </div>
    </header>

    <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
      {bottom.map(([href,icon,label])=><Link href={href} key={href}><span>{icon}</span><b>{label}</b></Link>)}
    </nav>
  </>
}
