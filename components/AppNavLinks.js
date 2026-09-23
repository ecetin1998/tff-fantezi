'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const matches=(path,href)=>href==='/' ? path==='/' : path===href || path.startsWith(href+'/')

export function DesktopNavLinks({ primary, analysis }){
  const path=usePathname()
  return <nav className="desktop-nav">
    {primary.map(([href,label])=><Link className={matches(path,href)?'nav-active':''} key={href} href={href}>{label}</Link>)}
    <details className="desktop-more">
      <summary className={analysis.some(([href])=>matches(path,href))?'nav-active':''}>Analizler <span>⌄</span></summary>
      <div className="desktop-more-panel">
        {analysis.map(([href,label])=><Link className={matches(path,href)?'nav-active':''} key={href} href={href}>{label}</Link>)}
      </div>
    </details>
  </nav>
}

export function MobileBottomNav({ items }){
  const path=usePathname()
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
    {items.map(([href,icon,label])=><Link className={matches(path,href)?'active':''} href={href} key={href}><span>{icon}</span><b>{label}</b></Link>)}
  </nav>
}
