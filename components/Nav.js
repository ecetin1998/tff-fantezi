import Link from 'next/link'
import {DesktopNavLinks,MobileBottomNav,MobileMenu} from '@/components/AppNavLinks'
import NavAccountControls from '@/components/NavAccountControls'

const primary=[['/','Ana Sayfa'],['/players','Oyuncu Analizi'],['/points','Fantezi Puanları'],['/matches','Maç Tahminleri'],['/squads','Kadro Önerileri']]
const analysis=[['/teams','Takım & Fikstür Analizi'],['/availability','Sakatlık / Ceza Durumu'],['/roles','Rol & Dakika Takibi'],['/backtest','Model Performansı']]
const bottom=[['/','home','Ana'],['/players','players','Oyuncular'],['/matches','matches','Maçlar'],['/squads','recommendations','Öneriler'],['/squad','squad','Kadrom']]

export default function Nav(){
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
        <NavAccountControls/>
        <MobileMenu primary={primary} analysis={analysis}/>
      </div>
    </header>
    <MobileBottomNav items={bottom}/>
  </>
}
