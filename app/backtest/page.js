import { getBacktestOverview } from '@/lib/data'

export const dynamic='force-dynamic'

const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)
const statusLabel={replay_pending:'Yeniden oynatma hazırlanacak',closed:'Kapandı',open:'Canlı / bekliyor'}

export default async function BacktestPage(){
  const {weeks,learning}=await getBacktestOverview()
  const closed=weeks.filter(w=>w.status==='closed'&&w.fp_mae!==null)
  const weightedN=closed.reduce((s,w)=>s+Number(w.fp_sample||0),0)
  const weightedMae=weightedN?closed.reduce((s,w)=>s+Number(w.fp_mae||0)*Number(w.fp_sample||0),0)/weightedN:null
  const frozen=closed.filter(w=>w.prediction_mode==='historical_frozen')
  const frozenN=frozen.reduce((s,w)=>s+Number(w.fp_sample||0),0)
  const frozenMae=frozenN?frozen.reduce((s,w)=>s+Number(w.fp_mae||0)*Number(w.fp_sample||0),0)/frozenN:null
  const latest=weeks.length?weeks[weeks.length-1]:null

  return <main className="page-shell backtest-page">
    <section className="page-hero backtest-hero">
      <div>
        <span className="eyebrow">MODEL ÖĞRENME DÖNGÜSÜ</span>
        <h1>Model Performansı</h1>
        <p>Her maç haftasında tahmini dondur, gerçekleşen puanla karşılaştır ve hatanın kaynağını izle.</p>
      </div>
      <div className="backtest-live-badge"><small>Güncel takip</small><b>{'MH'+(latest?.gameweek||'—')}</b><span>{statusLabel[latest?.status]||'—'}</span></div>
    </section>

    <section className="backtest-summary-grid">
      <article className="card"><span>Karşılaştırılan hafta</span><b>{closed.length}</b><small>Ölçülebilen haftalar</small></article>
      <article className="card"><span>Tüm kayıtlar ağırlıklı MAE</span><b>{num(weightedMae)}</b><small>Fantezi puanı</small></article>
      <article className="card"><span>Dondurulmuş haftalar MAE</span><b>{num(frozenMae)}</b><small>Maç öncesi kayıtlar</small></article>
      <article className="card"><span>Güncel dondurulmuş oyuncu</span><b>{latest?.prediction_count??'—'}</b><small>Hafta kapanınca eşleşecek</small></article>
    </section>

    <section className="card backtest-explainer">
      <div><b>Dondurulmuş kayıt</b><p>Maç başlamadan önce kaydedilmiş gerçek tahmin.</p></div>
      <div><b>Yeniden oluşturulmuş</b><p>Yalnız önceki haftalara kadar olan veriyle tekrar çalıştırılmış test.</p></div>
      <div><b>MH1 başlangıç testi</b><p>Yalnız sezon öncesi bilgiyle üretilecek ayrı test.</p></div>
    </section>
    <section className="card backtest-table-card">
      <div className="panel-head">
        <div><span className="eyebrow">HAFTALIK KARNE</span><h2>Tahmin ne kadar yaklaştı?</h2></div>
        <small>Yanlılık + ise model fazla, − ise az puan beklemiş demektir.</small>
      </div>
      <div className="table-scroll">
        <table className="backtest-table">
          <thead><tr><th>MH</th><th>Kayıt</th><th>Veri sınırı</th><th>Örnek</th><th>MAE</th><th>Yanlılık</th><th>RMSE</th><th>Sıra korelasyonu</th><th>İlk 25</th><th>Veri güveni</th><th>Durum</th></tr></thead>
          <tbody>
            {weeks.map(w=><tr key={w.gameweek} className={w.status==='open'?'current-backtest-row':''}>
              <td><b>{'MH'+w.gameweek}</b></td>
              <td>{w.prediction_mode}</td>
              <td>{w.training_through_gameweek===0?'Sezon öncesi':'MH1–MH'+w.training_through_gameweek}</td>
              <td>{w.fp_sample??'—'}</td>
              <td><b>{num(w.fp_mae)}</b></td>
              <td>{num(w.fp_bias)}</td>
              <td>{num(w.fp_rmse)}</td>
              <td>{w.spearman===null||w.spearman===undefined?'—':Number(w.spearman).toFixed(2)}</td>
              <td>{pct(w.top25_hit_rate)}</td>
              <td>{w.data_confidence||'—'}</td>
              <td>{statusLabel[w.status]||w.status}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <section className="card learning-section">
      <div className="panel-head">
        <div><span className="eyebrow">ÖĞRENME GÜNLÜĞÜ</span><h2>Model nerede hata yapıyor?</h2></div>
        <small>Tek haftalık sapma otomatik olarak modeli değiştirmez.</small>
      </div>
      <div className="learning-grid">
        {learning.map(item=><article key={item.id} className="learning-card">
          <div><span>{'MH'+item.after_gameweek+' sonrası'}</span><em>{item.status==='baseline'?'Başlangıç':item.status==='applied'?'Uygulandı':'İzleniyor'}</em></div>
          <h3>{item.component}</h3><p>{item.signal}</p><strong>{item.evidence}</strong><small>{item.guardrail}</small>
        </article>)}
      </div>
    </section>

    <section className="card learning-rules">
      <span className="eyebrow">OTOMATİK ÖĞRENME KURALI</span>
      <h2>Model kendi kendine değişecek ama kontrolsüz değil</h2>
      <div className="learning-rule-grid">
        <div><b>1</b><span>Hafta başlamadan tahmini ve girdileri dondur.</span></div>
        <div><b>2</b><span>Hafta kapanınca xFP, dakika, 6+, sıralama, XI ve kaptan başarısını ölç.</span></div>
        <div><b>3</b><span>Hatanın dakika, rol, takım süreci, bitiricilik, yaratım, gol yememe/kurtarış veya bonus kaynaklı olup olmadığını ayır.</span></div>
        <div><b>4</b><span>Aynı yönde en az 3 hafta veya bileşende en az 30 oyuncu-maç kanıtı yoksa sadece izle.</span></div>
        <div><b>5</b><span>Kanıt yeterliyse yalnız ilgili bileşene küçük ve limitli ayar uygula; dondurulmuş geçmişi değiştirme.</span></div>
        <div><b>6</b><span>Yeni ayarın sonraki haftalarda gerçekten iyileştirip iyileştirmediğini ayrıca geriye dönük test et.</span></div>
      </div>
    </section>
  </main>
}
