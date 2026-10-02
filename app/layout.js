import './globals.css'
import siteShell from '@/components/SiteShell.module.css'
import premiumViews from '@/components/PremiumViews.module.css'
import dataViews from '@/components/DataViews.module.css'
import managerCards from '@/components/ManagerCards.module.css'
import Nav from '@/components/Nav'

const cssScopes=[siteShell.scope,premiumViews.scope,dataViews.scope,managerCards.scope].join(' ')

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.ecetin1998.workers.dev'
export const metadata={
  metadataBase:new URL(siteUrl),
  title:{default:'Fantezi Rehberi — Süper Lig Fantezi',template:'%s | Fantezi Rehberi'},
  description:'Süper Lig fantezi için xFP, dakika, rol, kadro ve maç tahminleri.',
  openGraph:{
    type:'website',
    locale:'tr_TR',
    siteName:'Fantezi Rehberi',
    title:'Fantezi Rehberi — Süper Lig Fantezi',
    description:'Süper Lig fantezi için oyuncu, maç ve kadro analizleri.',
    url:siteUrl,
  },
  twitter:{card:'summary_large_image',title:'Fantezi Rehberi',description:'Süper Lig fantezi analiz merkezi.'},
}
export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'}
export const headers={
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Content-Type-Options':'nosniff'
}
export default function RootLayout({children}){return <html lang="tr" className={cssScopes}><body className={cssScopes}><Nav/><main>{children}</main><footer><span>Fantezi Rehberi • bağımsız analiz platformu</span><a href="/sss">SSS & Rehber</a><span>Resmî TFF ürünü değildir.</span></footer></body></html>}
