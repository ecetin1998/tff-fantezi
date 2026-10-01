import { getAuthState, getRecommendation } from '@/lib/data'
import SquadPitchView from '@/components/SquadPitchView'
import AccessGate from '@/components/AccessGate'
import {playerLabel} from '@/lib/playerPresentation'
import ManagerCardRecommendations from '@/components/ManagerCardRecommendations'

export const metadata={title:'Kadro Önerileri'}

export const revalidate=300

export default async function Squads(){
  const auth=await getAuthState()
  const rec=await getRecommendation('recommended')
  const alt=auth.plan==='pro'?await getRecommendation('alternative'):null

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
      <span>◇ Agresif 11: xFP'yi koruyup tavanı artırır • Önerilen İlk 11'den 2-4 oyuncu farklı • kaptan tavan odaklı</span>
    </div>

    {auth.tier==='visitor'?<>
      <section className="card recommendation-preview-card">
        <div><span className="eyebrow">ÜCRETSİZ ÖNİZLEME</span><h2>Model kadrosundan ilk adaylar</h2><p>Önerilen kadronun tamamını ve yedekleri görmek için ücretsiz hesap aç.</p></div>
        <div className="recommendation-preview-list">
          {(rec.members||[]).filter(x=>x.squad_slot==='XI').slice(0,3).map((m,i)=><div key={m.player_id}><span>#{i+1}</span><b>{playerLabel(m.player)}</b><small>{m.team} • {Number(m.xfp||0).toFixed(2)} xFP</small></div>)}
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
        title="Menajer kartı optimizasyonunu ve Agresif 11'i aç."
        description="Gelişmiş üyelikte seçtiğin menajer kartına göre kadro, diziliş, kaptan ve bütçe yeniden hesaplanır."
      />
    </div>}
  </>
}
