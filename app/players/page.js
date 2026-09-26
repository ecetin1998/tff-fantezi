import PlayersTable from '@/components/PlayersTable'
import { getPlayersWithProjection } from '@/lib/data'

export const revalidate=300
export const metadata={title:'Oyuncu Analizi'}

export default async function Players({searchParams}){
  const sp=await searchParams
  const {players,run}=await getPlayersWithProjection()
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{players.length} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} initialFilters={{q:sp?.q||'',team:sp?.team||'',pos:sp?.pos||'',sort:sp?.sort||'xfp',dir:sp?.dir||'desc',page:sp?.page||1}}/>
  </>
}
