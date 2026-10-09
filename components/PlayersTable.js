'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {teamCssVars} from '@/lib/teamThemes'
import {availabilityCompactNote,availabilityIsIssue} from '@/lib/availability'
import {fixtureBadge,playerLabel} from '@/lib/playerPresentation'
import {playerRoleLabel} from '@/lib/playerRole'
import AccessGate from '@/components/AccessGate'

const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')
const PAGE_SIZE=50

export default function PlayersTable({players,total,page,pageCount,teams,filters,accessTier='visitor',staticPool=false,runId=null}){
  const router=useRouter()
  const [tier,setTier]=useState(accessTier)
  const [accessPending,setAccessPending]=useState(staticPool)
  const [localFilters,setLocalFilters]=useState(filters||{})
  const [pool,setPool]=useState(players)
  const [overlayError,setOverlayError]=useState(false)
  const [overlayRequestId,setOverlayRequestId]=useState(null)
  const isPro=tier==='pro'
  const isVisitor=tier==='visitor'
  const activeFilters=staticPool?localFilters:filters
  const [q,setQ]=useState(filters?.q||'')

  useEffect(()=>{if(!staticPool)setQ(activeFilters?.q||'')},[activeFilters?.q,staticPool])
  useEffect(()=>{
    if(!staticPool)return
    let cancelled=false
    const p=new URLSearchParams(window.location.search)
    const next={q:p.get('q')||'',team:p.get('team')||'',pos:p.get('pos')||'',sort:p.get('sort')||'xfp',dir:p.get('dir')||'desc',page:Number(p.get('page')||1)}
    setLocalFilters(next)
    setQ(next.q)
    setPool(players)
    setOverlayError(false)
    setOverlayRequestId(null)
    async function loadOverlay(){
      try{
        const accessResponse=await fetch('/api/access',{cache:'no-store'})
        if(!accessResponse.ok)throw new Error('Access check failed')
        const access=await accessResponse.json()
        if(cancelled)return
        setTier(access.tier||'visitor')
        if(access.plan!=='pro')return
        // Session cookies can refresh between the access check and the Pro RPC.
        // Retry transient 403/5xx failures with a bounded backoff, never bypassing auth.
        let data=null
        for(let attempt=0;attempt<3;attempt++){
          if(cancelled)return
          try{
            const response=await fetch('/api/pro-player-overlay'+(runId?'?run_id='+encodeURIComponent(runId):''),{cache:'no-store'})
            if(!response.ok){
              if(![403,429,500,502,503,504].includes(response.status))throw new Error('Pro metrics HTTP '+response.status)
              if(attempt===2){
                const details=await response.json().catch(()=>({}))
                if(!cancelled)setOverlayRequestId(details.request_id||null)
                throw new Error('Pro metrics HTTP '+response.status)
              }
            }else{
              const payload=await response.json()
              if(!Array.isArray(payload.rows))throw new Error('Invalid metrics response')
              if(runId&&payload.run_id!==runId){
                if(attempt===2)throw new Error('Model run mismatch')
              }else{
                data=payload
                break
              }
            }
          }catch(error){
            if(attempt===2)throw error
          }
          await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))
        }
        if(cancelled)return
        if(!data)throw new Error('Pro metrics unavailable')
        const overlay=new Map(data.rows.map(x=>[Number(x.player_id),x]))
        setPool(current=>current.map(player=>{
          const extra=overlay.get(Number(player.id))
          return extra?{...player,projection:{...player.projection,p25:extra.p25,p75:extra.p75,p90:extra.p90,six_plus_probability:extra.six_plus_probability,expected_goals:extra.expected_goals,expected_assists:extra.expected_assists,top25_score:extra.top25_score,top25_rank:extra.top25_rank}}:player
        }))
      }catch{
        if(!cancelled)setOverlayError(true)
      }finally{
        if(!cancelled)setAccessPending(false)
      }
    }
    loadOverlay()
    return()=>{cancelled=true}
  },[staticPool,runId,players])

  const navigate=useCallback(patch=>{
    const next={...(activeFilters||{}),...patch}
    const params=new URLSearchParams()
    if(next.q)params.set('q',next.q);if(next.team)params.set('team',next.team);if(next.pos)params.set('pos',next.pos)
    if(next.sort&&next.sort!=='xfp')params.set('sort',next.sort);if(next.dir&&next.dir!=='desc')params.set('dir',next.dir);if(Number(next.page||1)>1)params.set('page',String(next.page))
    const query=params.toString()
    if(staticPool){setLocalFilters(next);window.history.replaceState(null,'','/players'+(query?'?'+query:''))}
    else router.replace('/players'+(query?'?'+query:''),{scroll:false})
  },[activeFilters,router,staticPool])

  useEffect(()=>{
    if(q===(activeFilters?.q||''))return
    const timer=setTimeout(()=>navigate({q,page:1}),250)
    return ()=>clearTimeout(timer)
  },[q,activeFilters?.q,navigate])

  const changeSort=key=>{
    const same=activeFilters?.sort===key
    navigate({sort:key,dir:same&&activeFilters?.dir==='desc'?'asc':'desc',page:1})
  }
  const head=(key,label)=><th onClick={()=>changeSort(key)}>{label}{activeFilters?.sort===key?<span className="sortmark">{activeFilters?.dir==='asc'?' ↑':' ↓'}</span>:null}</th>
  const pct=v=>v===null||v===undefined||v===''?'—':String((Number(v)*100).toFixed(0))+'%'
  const num=(v,d=2)=>v===null||v===undefined||v===''?'—':Number(v).toFixed(d)
  const playerNote=p=>{
    const a=p.availability
    if(!a)return ''
    const visible=availabilityIsIssue(a)||a.availability_type==='return'||a.expected_return_date||a.suspension_fixture
    return visible?availabilityCompactNote(a):''
  }
  const localRows=useMemo(()=>{if(!staticPool)return players;const f=localFilters||{},needle=String(f.q||'').toLocaleLowerCase('tr');let rows=pool.filter(p=>(!f.team||p.team===f.team)&&(!f.pos||p.position===f.pos)&&(!needle||(`${p.full_name} ${p.team} ${p.projection?.opponent_name||''}`).toLocaleLowerCase('tr').includes(needle)));const val=(p,k)=>k==='name'?p.full_name:k==='team'?p.team:k==='pos'?p.position:k==='opp'?p.projection?.opponent_name:k==='price'?Number(p.price||0):k==='points'?Number(p.total_points||0):k==='xi'?Number(p.projection?.xi_probability||0):k==='minutes'?Number(p.projection?.x_minutes||0):k==='p25'?Number(p.projection?.p25||0):k==='p90'?Number(p.projection?.p90||0):k==='six'?Number(p.projection?.six_plus_probability||0):k==='xg'?Number(p.projection?.expected_goals||0):k==='xa'?Number(p.projection?.expected_assists||0):k==='value'?Number(p.projection?.value_score||0):Number(p.projection?.xfp||0);rows=[...rows].sort((a,b)=>{const av=val(a,f.sort||'xfp'),bv=val(b,f.sort||'xfp'),cmp=typeof av==='string'?String(av).localeCompare(String(bv),'tr'):av-bv;return f.dir==='asc'?cmp:-cmp});return rows},[staticPool,players,pool,localFilters])
  const effectiveTotal=staticPool?localRows.length:total,effectivePage=staticPool?Math.max(1,Number(localFilters?.page||1)):page,effectivePageCount=staticPool?Math.max(1,Math.ceil(effectiveTotal/PAGE_SIZE)):pageCount
  const visiblePlayers=staticPool?(isVisitor?localRows.slice(0,15):localRows.slice((effectivePage-1)*PAGE_SIZE,effectivePage*PAGE_SIZE)):players
  const offset=(Math.max(1,Number(effectivePage||1))-1)*PAGE_SIZE

  return <>
    {accessPending&&isVisitor?<div className="filters player-filters" aria-label="Filtreler hazırlanıyor" aria-busy="true">
      <input disabled placeholder="Oyuncu, takım veya rakip ara..." aria-label="Oyuncu arama yükleniyor"/>
      <select disabled aria-label="Takım filtresi yükleniyor"><option>Tüm takımlar</option></select>
      <select disabled aria-label="Mevki filtresi yükleniyor"><option>Tüm mevkiler</option></select>
      <select disabled className="mobile-sort-select" aria-label="Sıralama yükleniyor"><option>xFP'ye göre</option></select>
    </div>:null}
    {!isVisitor?<div className="filters player-filters">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Oyuncu, takım veya rakip ara..." aria-label="Oyuncu ara"/>
      <select value={activeFilters?.team||''} onChange={e=>navigate({team:e.target.value,page:1})}>
        <option value="">Tüm takımlar</option>{(teams||[]).map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={activeFilters?.pos||''} onChange={e=>navigate({pos:e.target.value,page:1})}>
        <option value="">Tüm mevkiler</option><option value="GK">KL</option><option value="DEF">DEF</option><option value="MID">OS</option><option value="FWD">FOR</option>
      </select>
      <select className="mobile-sort-select" value={activeFilters?.sort||'xfp'} onChange={e=>navigate({sort:e.target.value,dir:'desc',page:1})}>
        <option value="xfp">xFP'ye göre</option><option value="xi">İlk 11 ihtimaline göre</option><option value="minutes">Dakikaya göre</option>
        {isPro?<><option value="p90">P90'a göre</option><option value="six">6+ ihtimaline göre</option></>:null}
        <option value="points">Toplam puana göre</option><option value="value">F/P'ye göre</option><option value="price">Fiyata göre</option>
      </select>
    </div>:null}

    <div className="table-summary">{isVisitor?<><b>İlk {visiblePlayers.length}</b> oyuncu • xFP sıralaması • tüm oyuncu havuzu ücretsiz üyelikle açılır</>:<><b>{effectiveTotal}</b> oyuncu • {isPro?'Gelişmiş analiz görünümü':'ücretsiz üye görünümü'}</>}</div>
    {isPro&&overlayError?<div className="alert error" role="alert">Gelişmiş istatistikler yüklenemedi. Güncel veriler için sayfayı yenile.{overlayRequestId?' Hata kodu: '+overlayRequestId:''}</div>:null}
    <div className="projection-legend">
      Karar metrikleri: <b>İlk 11</b> + <b>xDakika</b> oynama ihtimalini, <b>xFP</b> ortalama beklentiyi gösterir.
      {isPro?<span> <b>P25/P90</b>, <b>6+</b>, <b>xG</b> ve <b>xA</b> Gelişmiş üyelik dağılım/üretim katmanlarıdır.</span>:<span> Puan dağılımı, 6+ ihtimali ve xG/xA detayları Gelişmiş üyelikte açılır.</span>}
    </div>
    {!isVisitor&&!isPro?<AccessGate
      compact
      tier="pro"
      eyebrow="GELİŞMİŞ ANALİZ"
      title="Tavan ve üretim metriklerini aç."
      description="P25/P90 dağılımı, 6+ ihtimali, xG/xA ve gelişmiş rol analizi Gelişmiş üyelikte görünür."
    />:null}

    {!visiblePlayers.length?<div className="card empty-filter-state">Bu filtrelerle eşleşen oyuncu bulunamadı.</div>:<>
      <div className="player-card-list">
        {visiblePlayers.map((p,i)=><Link href={'/players/'+p.id} className="card mobile-player-card team-accent-card" style={teamCssVars(p.team)} key={p.id}>
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
      </tr></thead><tbody>{visiblePlayers.map((p,i)=><tr className="team-player-row clickable-row" style={teamCssVars(p.team)} key={p.id}
        tabIndex={0} onClick={e=>{if(!e.target.closest('a,button,input,select'))router.push('/players/'+p.id)}} onKeyDown={e=>{if(e.key==='Enter')router.push('/players/'+p.id)}}>
        <td className="rank-col">#{offset+i+1}</td>
        <td><Link className="player-link team-player-link" href={'/players/'+p.id}><i className="club-dot"/><b>{playerLabel(p)}</b></Link>{fixtureBadge(p.projection)?<small className="cell-note">{fixtureBadge(p.projection)}</small>:null}{playerNote(p)?<small className="cell-note">{playerNote(p)}</small>:null}</td>
        <td><Link className="team-table-link" href={'/teams/'+p.team_id}>{p.team}</Link></td><td><span className={'pos '+p.position}>{posLabel(p.position)}</span>{playerRoleLabel(p)?<small className="cell-note">{playerRoleLabel(p)}</small>:null}</td><td>{p.projection?.opponent_name||'—'}</td><td>{p.projection?.venue==='HOME'?'Ev':p.projection?.venue==='AWAY'?'Dep':'—'}</td>
        <td>{num(p.price,1)}m</td><td><b>{num(p.total_points,0)}</b></td><td>{pct(p.projection?.xi_probability)}</td><td>{num(p.projection?.x_minutes,0)}</td><td><b>{num(p.projection?.xfp)}</b></td>
        {isPro?<><td>{num(p.projection?.p25,1)}</td><td>{num(p.projection?.p90,1)}</td><td>{pct(p.projection?.six_plus_probability)}</td><td>{num(p.projection?.expected_goals)}</td><td>{num(p.projection?.expected_assists)}</td></>:null}<td>{num(p.projection?.value_score)}</td>
      </tr>)}</tbody></table></div>
    </>}

    {isVisitor?<AccessGate
      compact
      tier="member"
      eyebrow="ÜCRETSİZ ÜYELİK"
      title="İlk 15'i gördün. Tüm oyuncu havuzunu aç."
      description="Ücretsiz hesapla arama, takım/mevki filtreleri, tüm temel oyuncu verileri ve Benim Kadrom açılır."
    />:null}

    {!isVisitor&&effectivePageCount>1?<div className="pagination-bar">
      <button type="button" disabled={effectivePage<=1} onClick={()=>navigate({page:Math.max(1,effectivePage-1)})}>← Önceki</button>
      <span>Sayfa <b>{effectivePage}</b> / {effectivePageCount}</span>
      <button type="button" disabled={effectivePage>=effectivePageCount} onClick={()=>navigate({page:Math.min(effectivePageCount,effectivePage+1)})}>Sonraki →</button>
    </div>:null}
  </>
}
