import {getTeamFixturesOverview} from '@/lib/data'
import TeamsExplorer from '@/components/TeamsExplorer'

export const metadata={title:'Takım Analizi'}
export const revalidate=300

export default async function Teams(){
  const {run,teams}=await getTeamFixturesOverview()

  return <>
    <div className="section-title team-analysis-title">
      <div>
        <span className="eyebrow">TAKIM ANALİZİ</span>
        <h1>MH{run?.gameweek||'—'} Takım Analizi</h1>
        <p className="muted">Haftanın rakibi, maç modeli ve sezon takım profili tek ekranda.</p>
      </div>
      <span className="team-analysis-count">{teams.length} takım</span>
    </div>
    <div className="team-analysis-legend">
      <span><b>Bu hafta xG</b> maç özelindeki gol üretim beklentisi</span>
      <span><b>Gol yememe</b> olasılığı</span>
      <span><b>Toplam xFP</b> takım oyuncularının haftalık toplam beklentisi</span>
      <span><b>xG farkı</b> sezonluk hücum-savunma dengesi</span>
    </div>
    <TeamsExplorer teams={teams} gameweek={run?.gameweek}/>
  </>
}
