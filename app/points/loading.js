export default function Loading(){
  return <div className="grid player-loading-grid">
    {Array.from({length:6},(_,i)=><div className="card route-loading-card" key={i}><span/><b/><i/></div>)}
  </div>
}
