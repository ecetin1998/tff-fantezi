import './globals.css'
import siteShell from '@/components/SiteShell.module.css'
import premiumViews from '@/components/PremiumViews.module.css'
import dataViews from '@/components/DataViews.module.css'
import managerCards from '@/components/ManagerCards.module.css'
import Nav from '@/components/Nav'
import JsonLd from '@/components/JsonLd'

const cssScopes=[siteShell.scope,premiumViews.scope,dataViews.scope,managerCards.scope].join(' ')

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://fanteziligrehberi.com'
export const metadata={
  metadataBase:new URL(siteUrl),
  title:{default:'Fantezi Lig Rehberi — Süper Lig Fantezi',template:'%s | Fantezi Lig Rehberi'},
  description:'Süper Lig Fantezi Lig için haftalık kadro önerisi, kaptan adayları, oyuncu xFP tahminleri, maç olasılıkları ve sakatlık-ceza takibi.',
  openGraph:{
    type:'website',
    locale:'tr_TR',
    siteName:'Fantezi Lig Rehberi',
    title:'Fantezi Lig Rehberi — Süper Lig Fantezi',
    description:'Süper Lig fantezi için oyuncu, maç ve kadro analizleri.',
    url:siteUrl,
  },
  twitter:{card:'summary_large_image',title:'Fantezi Lig Rehberi',description:'Süper Lig fantezi analiz merkezi.'},
}
export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'}
export const headers={
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Content-Type-Options':'nosniff'
}
const siteJsonLd={
  '@context':'https://schema.org',
  '@graph':[
    {'@type':'WebSite','@id':siteUrl+'/#website',url:siteUrl,name:'Fantezi Lig Rehberi',inLanguage:'tr-TR',
      description:'Süper Lig Fantezi Lig için bağımsız oyuncu, maç ve kadro analiz platformu.',publisher:{'@id':siteUrl+'/#organization'}},
    {'@type':'Organization','@id':siteUrl+'/#organization',name:'Fantezi Lig Rehberi',url:siteUrl,logo:siteUrl+'/icon.svg'},
  ],
}
export default function RootLayout({children}){return <html lang="tr" className={cssScopes}><body className={cssScopes}><JsonLd data={siteJsonLd}/><Nav/><main>{children}</main><footer><span>Fantezi Lig Rehberi • bağımsız analiz platformu</span><a href="/sss">SSS & Rehber</a><span>Resmî TFF ürünü değildir. Bahis, kumar veya şans oyunlarıyla bağlantılı değildir; yalnızca fantezi futbol ve istatistiksel analiz amaçlıdır.</span></footer></body></html>}
