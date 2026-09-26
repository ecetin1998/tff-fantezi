import PlayersTable from '@/components/PlayersTable'
import { getPlayersWithProjection } from '@/lib/data'

export const revalidate=300
export const metadata={title:'Oyuncu Analizi'}

export default async function Players(){
  const {players,run}=await getPlayersWithProjection()
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{players.length} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={players} initialFilters={{q:'',team:'',pos:'',sort:'xfp',dir:'desc',page:1}}/>
  </>
}
