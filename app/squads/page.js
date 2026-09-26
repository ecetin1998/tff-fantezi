import { getRecommendation } from '@/lib/data'
import SquadPitchView from '@/components/SquadPitchView'

export const metadata={title:'Kadro Önerileri'}

export const revalidate=300

export default async function Squads(){
  const [rec,alt]=await Promise.all([getRecommendation('recommended'),getRecommendation('alternative')])
  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">KADRO OPTİMİZASYONU</span>
        <h1>MH{rec.run?.gameweek||'—'} Kadro Önerileri</h1>
      </div>
      <span className="muted">Aynı saha görünümü • ilk 11 • yedek • kaptan • xFP</span>
    </div>

    <div className="squad-tabs-note">
      <span>● Önerilen: dengeli maksimum beklenen puan • risk dağıtımı için aynı takımın KL+DEF oyuncularından ilk 11’de en fazla 2 kişi</span>
      <span>◇ Tavan 11: P90 odaklı yüksek tavan • kaptan en yüksek P90’lı ilk 11 oyuncusu</span>
    </div>

    <div className="unified-squad-list">
      <section className="card unified-squad-card">
        <SquadPitchView
          members={rec.members}
          title="ÖNERİLEN KADRO"
          gameweek={rec.run?.gameweek}
          budget={rec.recommendation?.budget}
          xiXfp={rec.recommendation?.xi_xfp}
          variant="recommended"
          showBench
        />
      </section>

      <section className="card unified-squad-card">
        <SquadPitchView
          members={alt.members}
          title="TAVAN 11"
          gameweek={alt.run?.gameweek}
          budget={alt.recommendation?.budget}
          xiXfp={alt.recommendation?.xi_xfp}
          variant="alternative"
          showBench
        />
      </section>
    </div>
  </>
}
