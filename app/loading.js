export default function Loading(){
  return <div className="page-loading" aria-label="Yükleniyor">
    <div className="skeleton skeleton-kicker"/>
    <div className="skeleton skeleton-title"/>
    <div className="loading-grid">
      {Array.from({length:6},(_,i)=><div className="card loading-card" key={i}>
        <div className="skeleton skeleton-line wide"/>
        <div className="skeleton skeleton-line"/>
        <div className="loading-metrics">
          <div className="skeleton skeleton-box"/><div className="skeleton skeleton-box"/><div className="skeleton skeleton-box"/>
        </div>
      </div>)}
    </div>
  </div>
}
