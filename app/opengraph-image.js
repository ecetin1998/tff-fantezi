import { ImageResponse } from 'next/og'

export const alt='Fantezi Scout — Süper Lig Fantasy Analiz Merkezi'
export const size={width:1200,height:630}
export const contentType='image/png'

export default function OpenGraphImage(){
  return new ImageResponse(
    <div style={{
      width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',
      background:'linear-gradient(135deg,#0b0b2d 0%,#15163f 58%,#0c3139 100%)',
      color:'#f5f6ff',fontFamily:'sans-serif'
    }}>
      <div style={{
        width:1060,height:450,border:'2px solid rgba(255,255,255,.14)',borderRadius:36,
        display:'flex',flexDirection:'column',justifyContent:'center',padding:'0 64px',
        background:'rgba(17,18,52,.82)'
      }}>
        <div style={{fontSize:74,fontWeight:900,letterSpacing:-3}}>FANTEZİ SCOUT</div>
        <div style={{fontSize:40,fontWeight:800,color:'#80f0c7',marginTop:22}}>Süper Lig Fantasy Analiz Merkezi</div>
        <div style={{fontSize:28,color:'#cdd0e6',marginTop:34}}>xFP • dakika • rol • maç tahmini • kadro önerileri</div>
      </div>
    </div>,
    size
  )
}
