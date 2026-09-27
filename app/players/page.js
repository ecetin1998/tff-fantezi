import PlayersTable from '@/components/PlayersTable'
import { getPlayersWithProjection } from '@/lib/data'

export const revalidate=300
export const metadata={
  title:'Oyuncu Analizi',
  description:'Süper Lig fantasy oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'
}

export default async function Players({searchParams}){
  const params=await searchParams
  const {players,run}=await getPlayersWithProjection()
  return <>
<div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{players.length} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} initialSearchParams={params||{}}/>
  </>
}
