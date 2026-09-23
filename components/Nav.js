import Link from 'next/link'
import { getAuthState } from '@/lib/data'
import { logout } from '@/app/actions'

export default async function Nav(){
  const auth = await getAuthState()
  return <header className="topbar">
    <Link href="/" className="brand"><span className="brand-mark">FS</span><span>Fantezi Scout</span><span className="beta">BETA</span></Link>
    <nav>
      <Link href="/">GW7</Link><Link href="/players">Oyuncular</Link><Link href="/matches">Maçlar</Link><Link href="/squad">Benim Kadrom</Link>
    </nav>
    <div className="nav-actions">
      <Link href="/pricing" className="pro-btn">Scout Pro</Link>
      {auth.userId ? <form action={logout}><button className="ghost-btn" type="submit">Çıkış</button></form> : <Link className="ghost-btn" href="/login">Giriş</Link>}
    </div>
  </header>
}
