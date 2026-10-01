'use client'
import {useCallback,useEffect,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {teamCssVars} from '@/lib/teamThemes'
import {availabilityCompactNote,availabilityIsIssue} from '@/lib/availability'
import {fixtureBadge,playerLabel} from '@/lib/playerPresentation'
import {playerRoleLabel} from '@/lib/playerRole'
import AccessGate from '@/components/AccessGate'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const PAGE_SIZE=50

export default function PlayersTable({players,total,page,pageCount,teams,filters,accessTier='visitor'}){
  const router=useRouter()
  const isPro=accessTier==='pro'
  const isVisitor=accessTier==='visitor'
  const [q,setQ]=useState(filters?.q||'')

  useEffect(()=>{setQ(filters?.q||'')},[filters?.q])

  const navigate=useCallback(patch=>{
    const next={...(filters||{}),...patch}
    const params=new URLSearchParams()
    if(next.q)params.set('q',next.q)
    if(next.team)params.set('team',next.team)
    if(next.pos)params.set('pos',next.pos)
    if(next.sort&&next.sort!=='xfp')params.set('sort',next.sort)
    if(next.dir&&next.dir!=='desc')params.set('dir',next.dir)
    if(Number(next.page||1)>1)params.set('page',String(next.page))
    const query=params.toString()
    router.replace('/players'+(query?'?'+query:''),{scroll:false})
  },[filters,router])

  useEffect(()=>{
    if(q===(filters?.q||''))return
    const timer=setTimeout(()=>navigate({q,page:1}),250)
    return ()=>clearTimeout(timer)
  },[q,filters?.q,navigate])

  const changeSort=key=>{
    const same=filters?.sort===key
    navigate({sort:key,dir:same&&filters?.dir==='desc'?'asc':'desc',page:1})
  }
  const head=(key,label)=><th onClick={()=>changeSort(key)}>{label}{filters?.sort===key?<span className="sortmark">{filters?.dir==='asc'?' ↑':' ↓'}</span>:null}</th>
  const pct=v=>String((Number(v||0)*100).toFixed(0))+'%'
  const num=(v,d=2)=>Number(v||0).toFixed(d)
  const playerNote=p=>{
    const a=p.availability
    if(!a)return ''
    const visible=availabilityIsIssue(a)||a.availability_type==='return'||a.expected_return_date||a.suspension_fixture
    return visible?availabilityCompactNote(a):''
  }
  const offset=(Math.max(1,Number(page||1))-1)*PAGE_SIZE

  return <>
    <div className="filters player-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya rakip ara..." aria-label="Oyuncu ara"/>
      <select value={filters?.team||''} onChange={e=>navigate({team:e.target.value,page:1})}>
        <option value="">Tüm takımlar</option>{(teams||[]).map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={filters?.pos||''} onChange={e=>navigate({pos:e.target.value,page:1})}>
        <option value="">Tüm mevkiler</option><option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
      </select>
      <select className="mobile-sort-select" value={filters?.sort||'xfp'} onChange={e=>navigate({sort:e.target.value,dir:'desc',page:1})}>
        <option value="xfp">xFP'ye göre</option><option value="xi">İlk 11 ihtimaline göre</option><option value="minutes">Dakikaya göre</option>
        {isPro?<><option value="p90">P90'a göre</option><option value="six">6+ ihtimaline göre</option></>:null}
        <option value="points">Toplam puana göre</option><option value="value">F/P'ye göre</option><option value="price">Fiyata göre</option>
      </select>
    </div>

    <div className="table-summary"><b>{total}</b> oyuncu • {isVisitor?'ziyaretçi önizlemesi':isPro?'Pro analiz görünümü':'ücretsiz üye görünümü'}</div>
    <div className="projection-legend">
      Karar metrikleri: <b>İlk 11</b> + <b>xDakika</b> oynama ihtimalini, <b>xFP</b> ortalama beklentiyi gösterir.
      {isPro?<span> <b>P25/P90</b>, <b>6+</b>, <b>xG</b> ve <b>xA</b> Pro dağılım/üretim katmanlarıdır.</span>:<span> Puan dağılımı, 6+ ihtimali ve xG/xA detayları Pro üyelikte açılır.</span>}
    </div>
    {!isPro?<AccessGate
      compact
      tier={isVisitor?'member':'pro'}
      eyebrow={isVisitor?'ÜCRETSİZ ÜYELİK':'PRO ANALİZ'}
      title={isVisitor?'Kadronu kaydetmek için ücretsiz hesap aç.':'Tavan ve üretim metriklerini aç.'}
      description={isVisitor?'Üyelikle Benim Kadrom ve tam temel oyuncu görünümü açılır. Pro ile P25/P90, 6+, xG ve xA detaylarına geçersin.':'P25/P90 dağılımı, 6+ ihtimali, xG/xA ve gelişmiş rol analizi Pro üyelikte görünür.'}
    />:null}

    {!players.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen oyuncu bulunamadı.</div>:<>
      <div className="player-card-list">
        {players.map((p,i)=><Link href={'/players/'+p.id} className="card mobile-player-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
          <div className="mobile-player-top">
            <div className="mobile-card-badges"><span className="weekly-rank">#{offset+i+1}</span><span className={'pos '+p.position}>{posLabel(p.position)}</span></div>
            <div className="mobile-player-name"><b>{playerLabel(p)}</b><span>{p.team}{playerRoleLabel(p)?' • '+playerRoleLabel(p):''} • {num(p.price,1)}m</span><small className="player-meta-badges">{fixtureBadge(p.projection)?<em>{fixtureBadge(p.projection)}</em>:null}</small></div>
            <div className="mobile-xfp"><strong>{num(p.projection?.xfp)}</strong><small>xFP</small><em>{num(p.total_points,0)} toplam puan</em></div>
          </div>
          <div className="mobile-fixture"><span>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</span><b>Rakip: {p.projection?.opponent_name||'—'}</b>{playerNote(p)?<em>{playerNote(p)}</em>:null}</div>
          <div className="mobile-player-metrics">
            <div><span>İlk 11</span><b>{pct(p.projection?.xi_probability)}</b></div>
            <div><span>xDakika</span><b>{num(p.projection?.x_minutes,0)}</b></div>
            {isPro?<><div><span>6+ puan</span><b>{pct(p.projection?.six_plus_probability)}</b></div><div><span>P90</span><b>{num(p.projection?.p90,1)}</b></div></>:<>
              <div><span>F/P</span><b>{num(p.projection?.value_score)}</b></div>
              <div><span>Toplam</span><b>{num(p.total_points,0)}</b></div>
            </>}
          </div>
        </Link>)}
      </div>
      <div className="card table-wrap desktop-player-table"><table><thead><tr>
        <th className="rank-col">#</th>{head('name','Oyuncu')}{head('team','Takım')}{head('pos','Mevki')}{head('opp','Rakip')}<th>E/D</th>
        {head('price','Fiyat')}{head('points','Toplam Puan')}{head('xi','İlk 11')}{head('minutes','xDk')}{head('xfp','xFP')}
        {isPro?<>{head('p25','P25')}{head('p90','P90')}{head('six','6+ %')}{head('xg','xG')}{head('xa','xA')}</>:null}{head('value','F/P')}
      </tr></thead><tbody>{players.map((p,i)=><tr className="team-player-row clickable-row" style={teamCssVars(p.team)} key={p.id}
        tabIndex={0} onClick={e=>{if(!e.target.closest('a,button,input,select'))router.push('/players/'+p.id)}} onKeyDown={e=>{if(e.key==='Enter')router.push('/players/'+p.id)}}>
        <td className="rank-col">#{offset+i+1}</td>
        <td><Link className="player-link team-player-link" href={'/players/'+p.id}><i className="club-dot"/><b>{playerLabel(p)}</b></Link>{fixtureBadge(p.projection)?<small className="cell-note">{fixtureBadge(p.projection)}</small>:null}{playerNote(p)?<small className="cell-note">{playerNote(p)}</small>:null}</td>
        <td><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></td><td><span className={'pos '+p.position}>{posLabel(p.position)}</span>{playerRoleLabel(p)?<small className="cell-note">{playerRoleLabel(p)}</small>:null}</td><td>{p.projection?.opponent_name||'—'}</td><td>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</td>
        <td>{num(p.price,1)}m</td><td><b>{num(p.total_points,0)}</b></td><td>{pct(p.projection?.xi_probability)}</td><td>{num(p.projection?.x_minutes,0)}</td><td><b>{num(p.projection?.xfp)}</b></td>
        {isPro?<><td>{num(p.projection?.p25,1)}</td><td>{num(p.projection?.p90,1)}</td><td>{pct(p.projection?.six_plus_probability)}</td><td>{num(p.projection?.expected_goals)}</td><td>{num(p.projection?.expected_assists)}</td></>:null}<td>{num(p.projection?.value_score)}</td>
      </tr>)}</tbody></table></div>
    </>}

    {pageCount>1?<div className="pagination-bar">
      <button type="button" disabled={page<=1} onClick={()=>navigate({page:Math.max(1,page-1)})}>← Önceki</button>
      <span>Sayfa <b>{page}</b> / {pageCount}</span>
      <button type="button" disabled={page>=pageCount} onClick={()=>navigate({page:Math.min(pageCount,page+1)})}>Sonraki →</button>
    </div>:null}
  </>
}
