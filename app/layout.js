import './globals.css'
import siteShell from '@/components/SiteShell.module.css'
import premiumViews from '@/components/PremiumViews.module.css'
import squadWorkspace from '@/components/SquadWorkspace.module.css'
import analysisViews from '@/components/AnalysisViews.module.css'
import dataViews from '@/components/DataViews.module.css'
import Nav from '@/components/Nav'
import {SITE_URL} from '@/lib/config'

const cssScopes=[siteShell.scope,premiumViews.scope,squadWorkspace.scope,analysisViews.scope,dataViews.scope].join(' ')

const siteUrl=SITE_URL
export const metadata={
  metadataBase:new URL(siteUrl),
  title:{default:'Fantezi Scout — Süper Lig Fantasy',template:'%s | Fantezi Scout'},
  description:'Süper Lig fantasy için xFP, dakika, rol, kadro ve maç tahminleri.',
  openGraph:{
    type:'website',
    locale:'tr_TR',
    siteName:'Fantezi Scout',
    title:'Fantezi Scout — Süper Lig Fantasy',
    description:'Süper Lig fantasy için oyuncu, maç ve kadro analizleri.',
    url:siteUrl,
    images:[siteUrl+'/opengraph-image'],
  },
  twitter:{card:'summary_large_image',title:'Fantezi Scout',description:'Süper Lig fantasy analiz merkezi.',images:[siteUrl+'/opengraph-image']},
}
export default function RootLayout({children}){return <html lang="tr" className={cssScopes}><body className={cssScopes}><Nav/><main>{children}</main><footer><span>Fantezi Scout • bağımsız analiz platformu</span><a href="/sss">SSS & Rehber</a><span>Resmî TFF ürünü değildir.</span></footer></body></html>}
