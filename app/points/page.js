import WeeklyPointsTable from '@/components/WeeklyPointsTable'
import { getWeeklyPoints } from '@/lib/data'

export const revalidate=300
export const metadata={title:'Fantezi Puanları'}

export default async function WeeklyPoints({searchParams}){
  const sp=await searchParams
  const {players,throughGameweek,finalThroughGameweek}=await getWeeklyPoints()
  return <>
    <div className="section-title">
      <div><span className="eyebrow">GERÇEK FANTASY PUANLARI</span><h1>Haftalık Fantezi Puanları</h1></div>
      <span className="muted">MH1–MH{throughGameweek||'—'} • kesinleşen MH{finalThroughGameweek||'—'} • 0 dk maçlar form hesabına dahil değil</span>
    </div>
    <WeeklyPointsTable players={players} throughGameweek={throughGameweek} finalThroughGameweek={finalThroughGameweek}
      initialFilters={{q:sp?.q||'',team:sp?.team||'',pos:sp?.pos||'',sort:sp?.sort||'total',week:sp?.week||'',dir:sp?.dir||'desc',page:sp?.page||1}}/>
  </>
}
