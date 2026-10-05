import PlayersTable from '@/components/PlayersTable'
import {getAuthState,getPlayersPage} from '@/lib/data'

export const revalidate=300
export const metadata={
  title:'Oyuncu Analizi',
  description:'Süper Lig fantezi oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'
}

export default async function Players({searchParams}){
  const sp=await searchParams
  const requestedSort=sp?.sort||'xfp'
  const requestedOptions={
    q:sp?.q||'',
    team:sp?.team||'',
    pos:sp?.pos||'',
    sort:requestedSort,
    dir:sp?.dir||'desc',
    page:Number(sp?.page||1),
    pageSize:50,
  }
  const [auth,requestedData]=await Promise.all([getAuthState(),getPlayersPage(requestedOptions)])
  const isVisitor=auth.tier==='visitor'
  const advancedSorts=new Set(['p25','p90','six','xg','xa'])
  const sort=auth.plan==='pro'||!advancedSorts.has(requestedSort)?requestedSort:'xfp'
  const needsRestrictedView=isVisitor||(auth.plan!=='pro'&&sort!==requestedSort)
  const data=needsRestrictedView?await getPlayersPage({
    q:isVisitor?'':requestedOptions.q,
    team:isVisitor?'':requestedOptions.team,
    pos:isVisitor?'':requestedOptions.pos,
    sort:isVisitor?'xfp':sort,
    dir:isVisitor?'desc':requestedOptions.dir,
    page:isVisitor?1:requestedOptions.page,
    pageSize:isVisitor?15:50,
  }):requestedData
  const {players,run,total,page,pageCount,teams,filters}=data
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{total} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} total={total} page={page} pageCount={pageCount} teams={teams} filters={filters} accessTier={auth.tier}/>
  </>
}
