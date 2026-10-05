export default function Loading(){
  return <div className="route-loading" role="status" aria-live="polite" aria-label="Sayfa yükleniyor">
    <div className="route-loading-bar"/>
    <div className="route-loading-shell">
      <div className="route-loading-title"/>
      <div className="route-loading-grid">
        <div/><div/><div/>
      </div>
    </div>
  </div>
}
