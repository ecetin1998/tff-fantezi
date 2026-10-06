import PlayersTable from '@/components/PlayersTable'
import {getPlayersWithProjection} from '@/lib/data'

export const revalidate=300
export const metadata={title:'Oyuncu Analizi',description:'Süper Lig fantezi oyuncuları için xFP, ilk 11 ihtimali, beklenen dakika, puan aralığı ve fiyat/performans analizi.'}

export default async function Players(){
  const {players,run}=await getPlayersWithProjection()
  const active=(players||[]).filter(p=>p.active)
  const teams=[...new Set(active.map(p=>p.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'))
  return <>
    <div className="section-title"><div><span className="eyebrow">OYUNCU HAVUZU</span><h1>MH{run?.gameweek||'—'} Oyuncu Analizi</h1></div><span className="muted">{active.length} oyuncu • karar odaklı görünüm</span></div>
    <PlayersTable players={active} total={active.length} page={1} pageCount={1} teams={teams} filters={{q:'',team:'',pos:'',sort:'xfp',dir:'desc',page:1}} accessTier="visitor" staticPool runId={run?.id||null}/>
  </>
}
