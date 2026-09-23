import { getRecommendation } from '@/lib/data'
export const revalidate=300
function Squad({title,data}){
  const xi=data.members.filter(m=>m.squad_slot==='XI'), bench=data.members.filter(m=>m.squad_slot!=='XI')
  const groups=['GK','DEF','MID','FWD']
  return <section className="card squad-card"><div className="panel-head"><div><span className="eyebrow">{title}</span><h2>{data.recommendation?.formation||'—'}</h2></div><div className="budget"><b>{Number(data.recommendation?.budget||0).toFixed(1)}m</b><span>{Number(data.recommendation?.xi_xfp||0).toFixed(2)} XI xFP</span></div></div>
  <div className="formation">{groups.map(pos=><div className="formation-row" key={pos}>{xi.filter(m=>m.player?.position===pos).map(m=><div className="player-chip" key={m.player_id}><span className={`pos ${pos}`}>{pos}</span><b>{m.player?.full_name}</b><small>{m.team} • {Number(m.player?.price||0).toFixed(1)}m • {Number(m.xfp||0).toFixed(2)} xFP {m.is_captain?' • C':''}</small></div>)}</div>)}</div>
  <div className="bench"><span className="eyebrow">YEDEKLER</span>{bench.map(m=><div className="bench-row" key={m.player_id}><span className={`pos ${m.player?.position}`}>{m.player?.position}</span><b>{m.player?.full_name}</b><span>{Number(m.xfp||0).toFixed(2)} xFP</span></div>)}</div></section>
}
export default async function Squads(){
 const [rec,alt]=await Promise.all([getRecommendation('recommended'),getRecommendation('alternative')])
 return <><div className="section-title"><div><span className="eyebrow">KADRO OPTİMİZASYONU</span><h1>GW{rec.run?.gameweek||'—'} Kadroları</h1></div><span className="muted">Önerilen + ceiling alternatifi</span></div><div className="squad-grid"><Squad title="ÖNERİLEN KADRO" data={rec}/><Squad title="ALTERNATİF KADRO" data={alt}/></div></>
}