import PlayersTable from '@/components/PlayersTable'
import {getPlayersPage} from '@/lib/data'

export const revalidate=300
export const metadata={
  title:'Oyuncu Analizi',
  description:'Süper Lig fantasy oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'
}

export default async function Players({searchParams}){
  const sp=await searchParams
  const data=await getPlayersPage({
    q:sp?.q||'',
    team:sp?.team||'',
    pos:sp?.pos||'',
    sort:sp?.sort||'xfp',
    dir:sp?.dir||'desc',
    page:Number(sp?.page||1),
    pageSize:50,
  })
  const {players,run,total,page,pageCount,teams,filters}=data
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{total} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} total={total} page={page} pageCount={pageCount} teams={teams} filters={filters}/>
  </>
}
