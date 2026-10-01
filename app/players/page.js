import PlayersTable from '@/components/PlayersTable'
import {getAuthState,getPlayersPage} from '@/lib/data'

export const revalidate=300
export const metadata={
  title:'Oyuncu Analizi',
  description:'Süper Lig fantasy oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'
}

export default async function Players({searchParams}){
  const [sp,auth]=await Promise.all([searchParams,getAuthState()])
  const isVisitor=auth.tier==='visitor'
  const advancedSorts=new Set(['p25','p90','six','xg','xa'])
  const requestedSort=sp?.sort||'xfp'
  const sort=auth.plan==='pro'||!advancedSorts.has(requestedSort)?requestedSort:'xfp'
  const data=await getPlayersPage({
    q:isVisitor?'':sp?.q||'',
    team:isVisitor?'':sp?.team||'',
    pos:isVisitor?'':sp?.pos||'',
    sort:isVisitor?'xfp':sort,
    dir:isVisitor?'desc':sp?.dir||'desc',
    page:isVisitor?1:Number(sp?.page||1),
    pageSize:isVisitor?15:50,
  })
  const {players,run,total,page,pageCount,teams,filters}=data
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{total} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} total={total} page={page} pageCount={pageCount} teams={teams} filters={filters} accessTier={auth.tier}/>
  </>
}
