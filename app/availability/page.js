import Link from 'next/link'
import { getAvailability } from '@/lib/data'
export const revalidate=300
const labels={injuries:'Sakatlık',suspensions:'Ceza',return:'Dönüş',baseline:'Kontrol'}
const formatCheck=(value)=>{
  if(!value)return '—'
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value))
  const get=t=>parts.find(x=>x.type===t)?.value||''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}
export default async function Availability(){
  const {run,rows}=await getAvailability()
  return <><div className="section-title"><div><span className="eyebrow">SAKATLIK & CEZA</span><h1>GW{run?.gameweek||'—'} Durum Takibi</h1></div><span className="muted">{rows.length} kayıt</span></div>
  <div className="card table-wrap"><table><thead><tr><th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th><th>Neden</th><th>Kontrol</th></tr></thead>
  <tbody>{rows.map((r,i)=><tr key={`${r.player_id}-${i}`}><td>{i+1}</td><td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td><td>{r.team}</td><td><span className={`pos ${r.player?.position}`}>{r.player?.position}</span></td><td><span className="status-chip">{labels[r.availability_type]||r.availability_type}</span></td><td>{(Number(r.availability_probability||0)*100).toFixed(0)}%</td><td>{r.reason||'—'}</td><td>{formatCheck(r.checked_at)}</td></tr>)}</tbody></table></div></>
}