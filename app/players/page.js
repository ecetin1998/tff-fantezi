import PlayersTable from '@/components/PlayersTable'
import { getPlayersWithProjection } from '@/lib/data'
export const revalidate=300
export default async function Players(){const {players,run}=await getPlayersWithProjection();return <><div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>GW{run?.gameweek||'—'} Oyuncu Tahminleri</h1></div><span className="muted">{players.length} oyuncu • {run?.simulation_count?.toLocaleString('tr-TR')} simülasyon</span></div><PlayersTable players={players}/></>}
