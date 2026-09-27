import {Suspense} from 'react'
import PlayersTable from '@/components/PlayersTable'
import { getPlayersWithProjection } from '@/lib/data'
import DataFreshnessBanner from '@/components/DataFreshnessBanner'

export const revalidate=300
export const metadata={
  title:'Oyuncu Analizi',
  description:'Süper Lig fantasy oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'
}

export default async function Players(){
  const {players,run}=await getPlayersWithProjection()
  return <>
    <DataFreshnessBanner run={run}/>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{players.length} oyuncu • karar odaklı görünüm</span></div>
    <Suspense fallback={<div className="card">Oyuncular hazırlanıyor…</div>}>
      <PlayersTable players={players} run={run}/>
    </Suspense>
  </>
}
