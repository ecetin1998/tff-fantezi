import Link from 'next/link'
import { getAuthState } from '@/lib/data'
import { logout } from '@/app/actions'
import { DesktopNavLinks, MobileBottomNav, MobileMenu } from '@/components/AppNavLinks'

const primary = [
  ['/', 'Ana Sayfa'],
  ['/players', 'Oyuncu Analizi'],
  ['/points', 'Fantezi Puanları'],
  ['/matches', 'Maç Tahminleri'],
  ['/squads', 'Kadro Önerileri'],
]

const analysis = [
  ['/teams', 'Takım & Fikstür Analizi'],
  ['/availability', 'Sakatlık / Ceza Durumu'],
  ['/roles', 'Rol & Dakika Takibi'],
]

const bottom = [
  ['/', 'home', 'Ana'],
  ['/players', 'players', 'Oyuncular'],
  ['/matches', 'matches', 'Maçlar'],
  ['/squads', 'recommendations', 'Öneriler'],
  ['/squad', 'squad', 'Kadrom'],
]

export default async function Nav(){
  const auth=await getAuthState()
  return <>
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">FS</span>
        <span className="brand-copy"><b>Fantezi Scout</b><small>Süper Lig analiz merkezi</small></span>
        <span className="beta">BETA</span>
      </Link>

      <DesktopNavLinks primary={primary} analysis={analysis}/>

      <div className="nav-actions">
        <Link href="/squad" className="my-team-btn">Benim Kadrom</Link>
        <Link href="/pricing" className="pro-btn">{auth.plan==='pro'?'PRO ✓':'PRO'}</Link>
        {auth.userId
          ? <form className="desktop-auth" action={logout}><button className="ghost-btn" type="submit">Çıkış</button></form>
          : <Link className="ghost-btn desktop-auth" href="/login">Giriş</Link>}
        <MobileMenu primary={primary} analysis={analysis} signedIn={Boolean(auth.userId)}/>
      </div>
    </header>
    <MobileBottomNav items={bottom}/>
  </>
}
