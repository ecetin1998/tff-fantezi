import Link from 'next/link'
import { getRoleSignals } from '@/lib/data'

export const revalidate=300

const pct=v=>`${(Number(v||0)*100).toFixed(0)}%`
const num=(v,d=0)=>Number(v||0).toFixed(d)
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const signalClass=s=>s==='ROL YÜKSELİYOR'?'up':s==='ROL DÜŞÜYOR'?'down':s==='DÖNÜŞ'?'return':s==='YOK'?'out':'stable'

export default async function Roles(){
  const {run,rows}=await getRoleSignals()
  const order={'ROL YÜKSELİYOR':0,'DÖNÜŞ':1,'ROL DÜŞÜYOR':2,'YOK':3,'BELİRGİN DEĞİŞİM YOK':4}
  const sorted=[...rows].sort((a,b)=>(order[a.signal]??9)-(order[b.signal]??9)||Number(b.x_minutes)-Number(a.x_minutes))
  const changed=sorted.filter(r=>r.signal&&r.signal!=='BELİRGİN DEĞİŞİM YOK')
  const rising=sorted.filter(r=>r.signal==='ROL YÜKSELİYOR'||r.signal==='DÖNÜŞ')
  const falling=sorted.filter(r=>r.signal==='ROL DÜŞÜYOR'||r.signal==='YOK')
  const strongXI=sorted.filter(r=>Number(r.predicted_xi_probability||0)>=.75)

  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">ROL TAKİBİ</span>
        <h1>MH{run?.gameweek||'—'} Dakika & Rol Sinyalleri</h1>
      </div>
      <span className="muted">{rows.length} oyuncu • karar odaklı görünüm</span>
    </div>

    <section className="role-summary-grid">
      <div className="card"><span>Rol değişimi</span><b>{changed.length}</b><small>dikkat gerektiren oyuncu</small></div>
      <div className="card role-up"><span>Yükselen / dönüş</span><b>{rising.length}</b><small>dakika fırsatı artan</small></div>
      <div className="card role-down"><span>Düşen / yok</span><b>{falling.length}</b><small>dakika riski artan</small></div>
      <div className="card"><span>Güçlü İlk 11</span><b>{strongXI.length}</b><small>tahmin XI ≥ %75</small></div>
    </section>

    {changed.length?<section className="card role-changes-card">
      <div className="panel-head">
        <div><span className="eyebrow">ÖNE ÇIKAN DEĞİŞİMLER</span><h2>Rolü değişen oyuncular</h2></div>
        <small>{changed.length} sinyal</small>
      </div>
      <div className="role-change-grid">
        {changed.map(r=>{
          const xiDelta=(Number(r.last2_xi_probability||0)-Number(r.previous2_xi_probability||0))*100
          const minDelta=Number(r.last2_minutes||0)-Number(r.previous2_minutes||0)
          return <Link href={'/players/'+r.player_id} className={`role-change-card ${signalClass(r.signal)}`} key={r.player_id}>
            <div className="role-change-head">
              <span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span>
              <div><b>{r.player?.full_name||'—'}</b><small>{r.team||'—'}</small></div>
              <em>{r.signal}</em>
            </div>
            <div className="role-change-metrics">
              <span><small>XI değişimi</small><b>{xiDelta>0?'+':''}{xiDelta.toFixed(0)} pp</b></span>
              <span><small>Dk değişimi</small><b>{minDelta>0?'+':''}{minDelta.toFixed(0)} dk</b></span>
              <span><small>MH{run?.gameweek||'—'} İlk 11</small><b>{pct(r.predicted_xi_probability)}</b></span>
              <span><small>xDakika</small><b>{num(r.x_minutes)}</b></span>
            </div>
          </Link>
        })}
      </div>
    </section>:null}

    <section className="card role-table-card">
      <div className="panel-head">
        <div><span className="eyebrow">TÜM OYUNCULAR</span><h2>Rol & dakika görünümü</h2></div>
        <small>Son dönem kullanımını gelecek hafta tahminiyle birlikte oku.</small>
      </div>
      <div className="table-wrap role-decision-table"><table>
        <thead><tr>
          <th>#</th><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>Sinyal</th>
          <th>Son 2 XI</th><th>XI Δ</th><th>Son 2 Dk</th><th>Dk Δ</th><th>Tahmin XI</th><th>xDk</th>
        </tr></thead>
        <tbody>{sorted.map((r,i)=>{
          const xiDelta=(Number(r.last2_xi_probability||0)-Number(r.previous2_xi_probability||0))*100
          const minDelta=Number(r.last2_minutes||0)-Number(r.previous2_minutes||0)
          return <tr key={r.player_id}>
            <td>{i+1}</td>
            <td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td>
            <td>{r.team}</td>
            <td><span className={`pos ${r.player?.position}`}>{posLabel(r.player?.position)}</span></td>
            <td><span className={`signal ${signalClass(r.signal)}`}>{r.signal}</span></td>
            <td>{pct(r.last2_xi_probability)}</td>
            <td className={xiDelta>0?'delta-up':xiDelta<0?'delta-down':''}>{xiDelta>0?'+':''}{xiDelta.toFixed(0)} pp</td>
            <td>{num(r.last2_minutes,0)}</td>
            <td className={minDelta>0?'delta-up':minDelta<0?'delta-down':''}>{minDelta>0?'+':''}{minDelta.toFixed(0)}</td>
            <td><b>{pct(r.predicted_xi_probability)}</b></td>
            <td><b>{num(r.x_minutes,0)}</b></td>
          </tr>
        })}</tbody>
      </table></div>
    </section>

    <details className="card role-advanced-details">
      <summary>
        <span><small>İLERİ ROL DETAYLARI</small><b>Eski dönem ve hücum paylarını göster</b></span>
        <i>+</i>
      </summary>
      <div className="table-wrap"><table>
        <thead><tr><th>Oyuncu</th><th>Önceki 2 XI</th><th>Önceki 2 Dk</th><th>Gol Payı</th><th>Asist Payı</th></tr></thead>
        <tbody>{sorted.map(r=><tr key={'advanced-'+r.player_id}>
          <td>{r.player?<Link className="player-link" href={'/players/'+r.player_id}><b>{r.player.full_name}</b></Link>:'—'}</td>
          <td>{pct(r.previous2_xi_probability)}</td>
          <td>{num(r.previous2_minutes,1)}</td>
          <td>{r.player?.position==='GK'?'—':pct(r.team_goal_share)}</td>
          <td>{r.player?.position==='GK'?'—':pct(r.team_assist_share)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </>
}
