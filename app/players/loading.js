export default function Loading(){
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>Oyuncu Analizi</h1></div></div>
    <div className="grid player-loading-grid">
      {Array.from({length:8},(_,i)=><div className="card route-loading-card" key={i}><span/><b/><i/></div>)}
    </div>
  </>
}
