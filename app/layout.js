import './globals.css'
import Nav from '@/components/Nav'
export const metadata={title:'Fantezi Scout — Süper Lig Fantasy',description:'Süper Lig fantasy için xFP, dakika, rol, kadro ve maç tahminleri.'}
export default function RootLayout({children}){return <html lang="tr"><body><Nav/><main>{children}</main><footer><span>Fantezi Scout • bağımsız analiz platformu</span><span>Resmî TFF ürünü değildir.</span></footer></body></html>}
