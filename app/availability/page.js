import { getAvailability } from '@/lib/data'
export const revalidate=300
const labels={injuries:'Sakatlık',suspensions:'Ceza',return:'Dönüş',baseline:'Kontrol'}
export default async function Availability(){
  const {run,rows}=await getAvailability()
  return <><div className="section-title"><div><span className="eyebrow">SAKATLIK & CEZA</span><h1>GW{run?.gameweek||'—'} Durum Takibi</h1></div><span className="muted">{rows.length} kayıt</span></div>
  <div className="card table-wrap"><table><thead><tr><th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Durum</th><th>Oynama %</th><th>Neden</th><th>Kontrol</th></tr></thead>
  <tbody>{rows.map((r,i)=><tr key={`${r.player_id}-${i}`}><td>{i+1}</td><td><b>{r.player?.full_name||'—'}</b></td><td>{r.team}</td><td><span className={`pos ${r.player?.position}`}>{r.player?.position}</span></td><td><span className="status-chip">{labels[r.availability_type]||r.availability_type}</span></td><td>{(Number(r.availability_probability||0)*100).toFixed(0)}%</td><td>{r.reason||'—'}</td><td>{r.checked_at?new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(r.checked_at)):'—'}</td></tr>)}</tbody></table></div></>
}