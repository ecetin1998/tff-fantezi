'use client'
import {useEffect} from 'react'

export default function GlobalError({error,reset}){
  useEffect(()=>{console.error('Application render error:',error)},[error])
  return <html lang="tr"><body style={{margin:0,fontFamily:'system-ui,-apple-system,Arial,sans-serif',background:'#f4f8fb',color:'#243845'}}>
    <main style={{maxWidth:540,margin:'13vh auto',padding:'24px'}}>
      <section role="alert" style={{border:'1px solid #dce6e6',borderRadius:18,padding:24,background:'#fff'}}>
        <h1 style={{fontSize:26,margin:'0 0 14px'}}>Fantezi Lig Rehberi yüklenemedi</h1>
        <p style={{lineHeight:1.5}}>Beklenmeyen bir hata oluştu. Sayfayı tekrar açmayı deneyebilirsin.</p>
        <button type="button" onClick={()=>reset()} style={{background:'#09806c',color:'#fff',border:0,borderRadius:10,padding:'12px 18px',fontWeight:750,marginRight:10}}>Tekrar dene</button>
        <button type="button" onClick={()=>window.location.reload()} style={{background:'#edf6f3',color:'#075e50',border:'1px solid #bfddd5',borderRadius:10,padding:'12px 18px'}}>Yenile</button>
      </section>
    </main>
  </body></html>
}
