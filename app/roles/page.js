import Link from 'next/link'
import { getRoleSignals } from '@/lib/data'
export const revalidate=300
export default async function Roles(){
  const {run,rows}=await getRoleSignals()
  const order={'ROL YÜKSELİYOR':0,'DÖNÜŞ':1,'ROL DÜŞÜYOR':2,'YOK':3,'BELİRGİN DEĞİŞİM YOK':4}
  const sorted=[...rows].sort((a,b)=>(order[a.signal]??9)-(order[b.signal]??9)||Number(b.x_minutes)-Number(a.x_minutes))
  return <><div className="section-title"><div><span className="eyebrow">ROL TAKİBİ</span><h1>GW{run?.gameweek||'—'} Dakika & Rol Sinyalleri</h1></div><span className="muted">{rows.length} oyuncu</span></div>
  <div className="card table-wrap"><table><thead><tr><th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Sinyal</th><th>Son 2 XI</th><th>Önceki 2 XI</th><th>Son 2 Dk</th><th>Önceki 2 Dk</th><th>Tahmin XI</th><th>xDk</th><th>Gol Payı</th><th>Asist Payı</th></tr></thead>
  <tbody>{sorted.map((r,i)=><tr key={r.player_id}><td>{i+1}</td><td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td><td>{r.team}</td><td><span className={`pos ${r.player?.position}`}>{r.player?.position}</span></td><td><span className={`signal ${r.signal==='ROL YÜKSELİYOR'?'up':r.signal==='ROL DÜŞÜYOR'?'down':''}`}>{r.signal}</span></td><td>{(Number(r.last2_xi_probability||0)*100).toFixed(0)}%</td><td>{(Number(r.previous2_xi_probability||0)*100).toFixed(0)}%</td><td>{Number(r.last2_minutes||0).toFixed(1)}</td><td>{Number(r.previous2_minutes||0).toFixed(1)}</td><td>{(Number(r.predicted_xi_probability||0)*100).toFixed(0)}%</td><td>{Number(r.x_minutes||0).toFixed(1)}</td><td>{(Number(r.team_goal_share||0)*100).toFixed(1)}%</td><td>{(Number(r.team_assist_share||0)*100).toFixed(1)}%</td></tr>)}</tbody></table></div></>
}