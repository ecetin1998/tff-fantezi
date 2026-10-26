export default function Loading(){
  return <div className="route-loading" role="status" aria-live="polite" aria-label="Sayfa yükleniyor">
    <div className="route-loading-bar"/>
    <div className="route-loading-shell">
      <p style={{display:'inline-flex',gap:8,alignItems:'center',padding:'11px 15px',border:'1px solid #bddfd8',borderRadius:12,background:'#ecf9f5',color:'#075f50',fontSize:14,fontWeight:750,margin:'0 0 18px'}}>
        <span aria-hidden="true">●</span> Sayfa yükleniyor…
      </p>
      <div className="route-loading-title"/>
      <div className="route-loading-grid"><div/><div/><div/></div>
    </div>
  </div>
}
