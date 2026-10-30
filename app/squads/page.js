import { getAuthState, getRecommendation } from '@/lib/data'
import SquadPitchView from '@/components/SquadPitchView'
import AccessGate from '@/components/AccessGate'
import {playerLabel,playerFixtureMeta} from '@/lib/playerPresentation'
import ManagerCardRecommendations from '@/components/ManagerCardRecommendations'

export const metadata={title:'Kadro Önerileri'}

// Week-aware HTML must not be frozen at build time or kept in Worker ISR
// when the active model is promoted; data fetching stays in run-scoped caches.
export const dynamic='force-dynamic'

export default async function Squads(){
  const [auth,rec,altCandidate]=await Promise.all([
    getAuthState(),
    getRecommendation('recommended'),
    getRecommendation('alternative'),
  ])
  const alt=auth.plan==='pro'?altCandidate:null

  return <>
    <div className="section-title">
      <div>
        <span className="eyebrow">KADRO OPTİMİZASYONU</span>
        <h1>MH{rec.run?.gameweek||'—'} Kadro Önerileri</h1>
      </div>
      <span className="muted">{auth.tier==='visitor'?'Ziyaretçi önizlemesi':auth.plan==='pro'?'Gelişmiş görünüm':'Ücretsiz üye görünümü'}</span>
    </div>

    <div className="squad-tabs-note">
      <span>● Önerilen: dengeli maksimum beklenen puan • risk dağıtımı için aynı takımın KL+DEF oyuncularından ilk 11’de en fazla 2 kişi</span>
      <span>◇ Tipik Puan 11: Oyuncuların 50K simülasyondaki en sık 3 farklı puanının ağırlıklı ortalamasını maksimize eder • ekranda tam sayıya yuvarlanır</span>
    </div>

    {auth.tier==='visitor'?<>
      <section className="card recommendation-preview-card">
        <div><span className="eyebrow">ÜCRETSİZ ÖNİZLEME</span><h2>Model kadrosundan ilk adaylar</h2><p>Önerilen kadronun tamamını ve yedekleri görmek için ücretsiz hesap aç.</p></div>
        <div className="recommendation-preview-list">
          {(rec.members||[]).filter(x=>x.squad_slot==='XI').slice(0,3).map((m,i)=><div key={m.player_id}><span>#{i+1}</span><b>{playerLabel(m.player)}</b><small>{playerFixtureMeta(m.player||{team:m.team})} • {Number(m.xfp||0).toFixed(2)} xFP</small></div>)}
        </div>
      </section>
      <AccessGate
        tier="member"
        eyebrow="ÜCRETSİZ ÜYELİK"
        title="Önerilen 15 kişilik kadroyu ücretsiz hesapla aç."
        description="Ücretsiz üyelikte Önerilen Kadro, ilk 11, yedekler, kaptan ve kendi kadronu kaydetme özelliği açılır."
      />
    </>:auth.plan==='pro'?<ManagerCardRecommendations
      baseRecommended={rec}
      baseAlternative={alt}
    />:<div className="unified-squad-list">
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
      <AccessGate
        tier="pro"
        eyebrow="GELİŞMİŞ • MENAJER KARTLARI"
        title="Menajer kartlarını ve Tipik Puan 11'i aç."
        description="Gelişmiş üyelikte seçtiğin menajer kartına göre kadro, diziliş, kaptan ve bütçe yeniden hesaplanır."
      />
    </div>}
  </>
}
