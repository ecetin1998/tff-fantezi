'use client'
import {useEffect} from 'react'

export default function Error({error,reset}){
  useEffect(()=>{console.error('Page rendering error:',error)},[error])
  return <section role="alert" style={{width:'min(560px,calc(100% - 32px))',margin:'42px auto',padding:'28px',borderRadius:18,background:'#fff',border:'1px solid #dce6e6',boxShadow:'0 10px 40px rgba(0,0,0,.08)',color:'#243845'}}>
    <h1 style={{fontSize:26,margin:'0 0 10px'}}>Sayfa yüklenemedi</h1>
    <p style={{lineHeight:1.6,margin:'0 0 22px'}}>Bağlantıda veya veri servisinde geçici bir sorun oluştu. Tekrar deneyebilir ya da sayfayı yenileyebilirsin.</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <button type="button" onClick={()=>reset()} style={{background:'#09806c',color:'#fff',border:0,borderRadius:10,padding:'12px 18px',fontWeight:750}}>Tekrar dene</button>
      <button type="button" onClick={()=>window.location.reload()} style={{background:'#edf6f3',color:'#075e50',border:'1px solid #bfddd5',borderRadius:10,padding:'12px 18px',fontWeight:750}}>Tam yenile</button>
    </div>
  </section>
}
