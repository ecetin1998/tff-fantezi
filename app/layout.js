import './globals.css'
import Nav from '@/components/Nav'

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'https://tff-fantezi.vercel.app'
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
  },
  twitter:{card:'summary_large_image',title:'Fantezi Scout',description:'Süper Lig fantasy analiz merkezi.'},
}
export default function RootLayout({children}){return <html lang="tr"><body><Nav/><main>{children}</main><footer><span>Fantezi Scout • bağımsız analiz platformu</span><span>Resmî TFF ürünü değildir.</span></footer></body></html>}
