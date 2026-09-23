import WeeklyPointsTable from '@/components/WeeklyPointsTable'
import { getWeeklyPoints } from '@/lib/data'

export const revalidate=300

export default async function WeeklyPoints(){
  const {players,throughGameweek}=await getWeeklyPoints()
  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">GERÇEK FANTASY PUANLARI</span>
        <h1>Haftalık Fantasy Puanları</h1>
      </div>
      <span className="muted">GW1–GW{throughGameweek||'—'} • final puanlar</span>
    </div>
    <WeeklyPointsTable players={players} throughGameweek={throughGameweek}/>
  </>
}
