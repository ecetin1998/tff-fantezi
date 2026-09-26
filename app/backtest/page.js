import { getBacktestOverview } from '@/lib/data'

export const dynamic='force-dynamic'
export const metadata={title:'Model Performansı'}

const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)
const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const pp=v=>v===null||v===undefined?'—':(Number(v)*100>=0?'+':'')+(Number(v)*100).toFixed(1)+' pp'
const replayStatus={
  cold_start_gap:'Başlangıç modeli eksik',
  replay_pending:'Hesaplanacak',
  closed:'Tamamlandı',
}
const liveStatus={
  open:'Hafta devam ediyor',
  closed:'Tamamlandı',
}
const learningStatus={
  applied:'Uygulandı',
  applied_pending_refresh:'Refresh bekliyor',
  ready_to_apply:'Uygulamaya hazır',
  no_change:'Değişiklik yok',
  watch:'İzleniyor',
  baseline:'Başlangıç',
}
const tendency=v=>{
  if(v===null||v===undefined)return '—'
  const n=Number(v)
  if(Math.abs(n)<.05)return 'Dengeli'
  return n>0?num(Math.abs(n))+' puan fazla bekliyor':num(Math.abs(n))+' puan az bekliyor'
}

export default async function BacktestPage(){
  const {currentRun,currentRunQa,replayWeeks,liveWeeks,learning,replayPlayers,livePlayers,preseasonCoverage}=await getBacktestOverview()
  const replayClosed=replayWeeks.filter(w=>w.status==='closed')
  const latestLive=liveWeeks.length?liveWeeks[liveWeeks.length-1]:null
  const replayBenchmark=replayWeeks[0]?.engine_version||'ScoutPlus 3.1'
  const replayBenchmarkVersion=replayWeeks[0]?.benchmark_version||'—'
  const productionQaPass=Boolean(currentRunQa?.pass)
  const publicModelVersion=(String(currentRun?.model_version||'').match(/ScoutPlus\s+\d+(?:\.\d+)*/)||['Canlı model'])[0]
  const replayN=replayClosed.reduce((s,w)=>s+Number(w.player_sample||0),0)
  const overallBand=replayN?replayClosed.reduce((s,w)=>s+Number(w.band_hit_rate||0)*Number(w.player_sample||0),0)/replayN:null
  const overallExpectedBand=replayN?replayClosed.reduce((s,w)=>s+Number(w.expected_band_hit_rate||0)*Number(w.player_sample||0),0)/replayN:null
  const overallBandGap=overallBand!==null&&overallExpectedBand!==null?overallBand-overallExpectedBand:null
  const overallOutside=replayN?replayClosed.reduce((s,w)=>s+Number(w.average_outside_distance||0)*Number(w.player_sample||0),0)/replayN:null
  const top25V2Weeks=replayClosed.filter(w=>w.top25_v2_hit_rate!==null&&w.top25_v2_hit_rate!==undefined)
  const overallTop25=replayClosed.length?replayClosed.reduce((s,w)=>s+Number(w.top25_hit_rate||0),0)/replayClosed.length:null
  const overallTop25V2=top25V2Weeks.length?top25V2Weeks.reduce((s,w)=>s+Number(w.top25_v2_hit_rate||0),0)/top25V2Weeks.length:null
  const overallTop25Lift=overallTop25!==null&&overallTop25V2!==null?overallTop25V2-overallTop25:null
  const latestLearning=[...learning]
    .sort((a,b)=>Number(b.id||0)-Number(a.id||0))
    .filter((item,index,rows)=>index===rows.findIndex(other=>other.component===item.component&&other.segment===item.segment))
  const learningPriority=item=>{const m=String(item.notes||'').match(/SIRA\s+(\d+)\/4/i);return m?Number(m[1]):99}
  const activeLearning=latestLearning
    .filter(item=>['watch','ready_to_apply','applied_pending_refresh'].includes(item.status))
    .sort((a,b)=>learningPriority(a)-learningPriority(b)||Number(a.id||0)-Number(b.id||0))
  const resolvedLearning=latestLearning.filter(item=>!['watch','ready_to_apply','applied_pending_refresh'].includes(item.status))

  return <main className="page-shell backtest-page">
    <section className="page-hero backtest-hero">
      <div>
        <span className="eyebrow">YAYINDAKİ MODEL + GERİYE DÖNÜK TEST</span>
        <h1>Model Performansı</h1>
        <p>Yayındaki modeli, geçmiş haftalara sonucu görmeden uygulanan geriye dönük testi ve MH7’den itibaren maç öncesi dondurulan gerçek tahminleri ayrı ayrı izliyoruz. Böylece bugünkü model ile tarihsel test birbirine karışmıyor.</p>
      </div>
      <div className="backtest-live-badge">
        <small>Yayındaki model</small>
        <b>{publicModelVersion} • MH{currentRun?.gameweek||'—'}</b>
        <span>{productionQaPass?'Kontrol geçti • yayındaki sürüm':'Kontrol bekliyor'}</span>
      </div>
    </section>

    <section className="card backtest-method">
      <div className="panel-head">
        <div><span className="eyebrow">YAYIN KONTROLÜ</span><h2>Yayına geçiş koruması</h2></div>
        <small>{currentRun?.generated_at?new Date(currentRun.generated_at).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'—'}</small>
      </div>
      <div className="backtest-explainer">
        <div><b>{productionQaPass?'PASS':'BEKLİYOR'} • MH{currentRun?.gameweek||'—'}</b><p>{currentRun?.status||'—'} durumunda • {Number(currentRunQa?.simulation_count||currentRun?.simulation_count||0).toLocaleString('tr-TR')} simülasyon. Kontrolleri geçmeyen aday sürüm yayına alınamaz; herhangi bir hata olursa önceki çalışan sürüm korunur.</p></div>
        <div><b>{currentRunQa?.active_projection_count??'—'} / {currentRunQa?.active_player_count??'—'} aktif oyuncu tahmini • {currentRunQa?.active_role_count??'—'} rol</b><p>Eksik aktif oyuncu {currentRunQa?.missing_active_projections??'—'} • eksik rol {currentRunQa?.missing_active_roles??'—'} • eski/pasif oyuncu sızıntısı {currentRunQa?.inactive_positive_projections??'—'} • oynamayacak oyuncu ihlali {currentRunQa?.hard_zero_violations??'—'}.</p></div>
        <div><b>{currentRunQa?.match_count??'—'} maç • {currentRunQa?.recommendation_count??'—'} kadro • ortak 11 {currentRunQa?.xi_overlap??'—'}/11</b><p>Takım dakika max sapma {currentRunQa?.max_team_minute_gap??'—'} dk • pay dağılımı ihlali {currentRunQa?.share_violations??'—'} • fikstür eşleşme hatası {currentRunQa?.data_integrity?.fixture_mismatch??'—'} • puan/dakika tutarsızlığı {currentRunQa?.data_integrity?.nonzero_points_zero_minutes??'—'}.</p></div>
      </div>
    </section>

    <section className="backtest-summary-grid">
      <article className="card"><span>Sonucu görmeden tamamlanan test</span><b>{replayClosed.length}<small>/6</small></b><small>MH1–MH6 • {replayBenchmark.replace('ScoutPlus ','v').replace('Cold Start','Başlangıç Modeli')}</small></article>
      <article className="card"><span>Tahmin bandında kalan</span><b>{pct(overallBand)}</b><small>Simülasyon beklenen {pct(overallExpectedBand)} • fark {pp(overallBandGap)}</small></article>
      <article className="card"><span>Band dışına çıkınca ortalama sapma</span><b>{num(overallOutside)}</b><small>Yalnız tahmin bandının dışındaki puan mesafesi</small></article>
      <article className="card"><span>Top‑25 yakalama • xFP</span><b>{pct(overallTop25)}</b><small>{overallTop25V2!==null?'Top-25 modeli '+pct(overallTop25V2)+' • fark '+pp(overallTop25Lift):'Top-25 modelinin ilk gerçek dış örnek ölçümü MH7 kapanınca oluşacak'}</small></article>
      <article className="card"><span>Şu an takip edilen hafta</span><b>{latestLive?'MH'+latestLive.gameweek:'—'}</b><small>{latestLive?liveStatus[latestLive.status]||latestLive.status:'Canlı kayıt yok'}</small></article>
    </section>

    <section className="card backtest-method">
      <div className="panel-head">
        <div><span className="eyebrow">TEST KURALI</span><h2>Sonucu görmeden tahmin et</h2></div>
      </div>
      <div className="backtest-explainer">
        <div><b>Güncel model testi</b><p>MH4 testinde model yalnız MH1–MH3 verisini görebilir. MH4 ve sonrasındaki hiçbir sonuç, dakika, xG veya fantezi puanı tahmine giremez.</p></div>
        <div><b>Başlangıç Modeli v1</b><p>MH1’de 2025-26 takım gücü, tarihli oyuncu verisi ve mevki ortalaması kullanılır. {preseasonCoverage?.players||0} oyuncuda bireysel başlangıç verisi vardır; kalanlarda daha düşük güvenli mevki öncülü kullanılır.</p></div>
        <div><b>Eski modeller yok</b><p>v4.2, v4.3f veya eski dondurulmuş xFP değerleri güncel modelin başarı hesabına dahil edilmez. Yalnız o tarihte bilinebilen ham geçmiş gerçekler kullanılır.</p></div>
      </div>
    </section>

    <section className="card backtest-table-card">
      <div className="panel-head">
        <div><span className="eyebrow">GERİYE DÖNÜK TEST • MH1–MH6</span><h2>Hafta hafta geriye dönük test</h2></div>
        <small>Yayındaki model değiştiğinde bu test yeni sürümle yeniden çalıştırılır.</small>
      </div>
      <div className="table-scroll">
        <table className="backtest-table replay-table">
          <thead><tr>
            <th>MH</th><th>Modelin bildiği veri</th><th>Oyuncu</th><th>Band içinde</th><th>Simülasyon beklenen</th><th>Kalibrasyon farkı</th><th>Band genişliği</th><th>Band dışı sapma</th><th>Model eğilimi</th><th>Sıralama uyumu</th><th>İlk 25 xFP</th><th>İlk 25 GB</th><th>Dakika hatası</th><th>Ana öğrenme</th><th>Durum</th>
          </tr></thead>
          <tbody>{replayWeeks.map(w=><tr key={w.gameweek} className={w.status==='cold_start_gap'?'replay-gap-row':''}>
            <td><b>{'MH'+w.gameweek}</b></td>
            <td>{w.data_through_gameweek===0?'Sezon öncesi / sıfır lig haftası':'MH1–MH'+w.data_through_gameweek}</td>
            <td>{w.player_sample??'—'}</td>
            <td><b>{pct(w.band_hit_rate)}</b></td>
            <td>{pct(w.expected_band_hit_rate)}</td>
            <td><b>{pp(w.self_band_calibration_gap)}</b></td>
            <td>{w.average_band_width===null||w.average_band_width===undefined?'—':num(w.average_band_width)+' puan'}</td>
            <td>{w.average_outside_distance===null||w.average_outside_distance===undefined?'—':num(w.average_outside_distance)+' puan'}</td>
            <td>{tendency(w.model_tendency)}</td>
            <td>{w.ranking_alignment===null||w.ranking_alignment===undefined?'—':num(w.ranking_alignment,2)+' / 1.00'}</td>
            <td>{pct(w.top25_hit_rate)}</td>
            <td><b>{pct(w.top25_v2_hit_rate)}</b></td>
            <td>{w.average_minute_error===null||w.average_minute_error===undefined?'—':num(w.average_minute_error,1)+' dk'}</td>
            <td className="learning-cell">{w.main_learning||'—'}</td>
            <td><span className={'replay-status '+w.status}>{replayStatus[w.status]||w.status}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="card metric-guide">
      <div className="panel-head"><div><span className="eyebrow">NE ANLAMA GELİYOR?</span><h2>Terimleri sade okuyalım</h2></div></div>
      <div className="metric-guide-grid">
        <div><b>Tahmin bandında kalma</b><p>P25–P90 aralığı modelin ürettiği olası sonuç alanıdır. Fantasy puanları kesikli olduğu için gerçekleşen kapsama sabit <strong>%65 olmak zorunda değildir</strong>. Artık tabloda aynı Monte Carlo dağılımının beklediği self-coverage ve gerçekleşen farkı ayrı ayrı gösteriyoruz.</p></div>
        <div><b>Band dışı sapma</b><p>Gerçek sonuç bandın dışına çıktıysa yalnız en yakın sınırdan uzaklığı ölçeriz. Örn. xFP 5, bant 2–13 ve gerçek 18 ise <strong>13 puan hata değil, band dışı 5 puan</strong> olarak değerlendirilir.</p></div>
        <div><b>Band genişliği</b><p>Belirsizliği ne kadar geniş bıraktığımızı gösterir. Amaç bandı körlemesine daraltmak değil; kesikli puan dağılımında beklenen self-coverage, gerçekleşen kapsama ve band dışı sapmayı birlikte iyileştirmektir.</p></div>
        <div><b>Model eğilimi</b><p>Merkez xFP’nin uzun vadede sistematik olarak fazla mı az mı kaldığını gösterir. Tek oyuncunun uç sonucu değil, tekrar eden yönlü sapma önemlidir.</p></div>
        <div><b>Sıralama ve dakika</b><p>Sıralama uyumu yüksek gördüğümüz oyuncuların gerçekten yukarı çıkıp çıkmadığını; dakika hatası ise rol/ilk 11 tahminimizin doğruluğunu gösterir. <strong>İlk 25 GB</strong>, xFP’yi bozmadan yüksek skor/tail adaylarını ayrı bir ranking katmanıyla ölçer.</p></div>\n        <div><b>Top‑25 modeli</b><p><strong>xFP</strong> beklenen fantasy puanını ölçmeye devam eder; Top‑25 modeli ise yüksek skor/tail adaylarını geçmiş haftalar üzerinde sonucu görmeden eğitilen ayrı bir sıralama katmanıyla tarar. Bu skor optimizerı veya ana xFP’yi değiştirmez ve kapanan her haftada xFP baselineına karşı yeniden ölçülür.</p></div>
      </div>
    </section>

    <section className="card backtest-table-card">
      <div className="panel-head">
        <div><span className="eyebrow">GERÇEK ZAMANLI PERFORMANS</span><h2>MH7’den itibaren gerçekten ne tahmin ettik?</h2></div>
        <small>Buradaki kayıtlar sonradan yeniden hesaplanmaz; o hafta başlamadan önce ne yayınlandıysa o kalır.</small>
      </div>
      <div className="table-scroll">
        <table className="backtest-table">
          <thead><tr><th>MH</th><th>Oyuncu</th><th>Band içinde</th><th>Band genişliği</th><th>Band dışı sapma</th><th>Model eğilimi</th><th>Sıralama uyumu</th><th>İlk 25</th><th>Dakika hatası</th><th>Durum</th></tr></thead>
          <tbody>{liveWeeks.length?liveWeeks.map(w=><tr key={w.gameweek} className={w.status==='open'?'current-backtest-row':''}>
            <td><b>{'MH'+w.gameweek}</b></td>
            <td>{w.fp_sample??w.prediction_count??'—'}</td>
            <td><b>{pct(w.band_hit_rate)}</b></td>
            <td>{w.average_band_width===null||w.average_band_width===undefined?'—':num(w.average_band_width)+' puan'}</td>
            <td>{w.average_outside_distance===null||w.average_outside_distance===undefined?'—':num(w.average_outside_distance)+' puan'}</td>
            <td>{tendency(w.fp_bias)}</td>
            <td>{w.spearman===null||w.spearman===undefined?'—':num(w.spearman,2)+' / 1.00'}</td>
            <td>{pct(w.top25_hit_rate)}</td>
            <td>{w.minute_mae===null||w.minute_mae===undefined?'—':num(w.minute_mae,1)+' dk'}</td>
            <td>{liveStatus[w.status]||w.status}</td>
          </tr>):<tr><td colSpan="10">Henüz canlı kapanmış hafta yok.</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <section className="card learning-section">
      <div className="panel-head">
        <div><span className="eyebrow">ÖĞRENME GÜNLÜĞÜ</span><h2>Neyi geliştirmemiz gerekiyor?</h2></div>
        <small>Tek oyuncu veya tek haftalık şansa göre model değiştirmiyoruz.</small>
      </div>
      {latestLearning.length?<div>
        <div className="panel-head"><div><span className="eyebrow">AÇIK AKSİYONLAR</span><h3>Takip etmeye devam ettiklerimiz</h3></div><small>{activeLearning.length} aktif sinyal</small></div>
        {activeLearning.length?<div className="learning-grid">{activeLearning.map(item=><article key={item.id} className="learning-card">
          <div><span>{learningPriority(item)<99?'Sıra '+learningPriority(item)+' • ':''}{'MH'+item.after_gameweek+' sonrası'}</span><em>{learningStatus[item.status]||item.status}</em></div>
          <h3>{item.component}</h3><p>{item.signal}</p><strong>{item.evidence}</strong><small>{item.guardrail}</small>
        </article>)}</div>:<div className="empty-learning-state">Şu an müdahale bekleyen açık model sorunu yok.</div>}
        {resolvedLearning.length?<><div className="panel-head" style={{marginTop:24}}><div><span className="eyebrow">KAPANAN KARARLAR</span><h3>Çözülen veya değişiklik gerektirmeyenler</h3></div><small>{resolvedLearning.length} kayıt</small></div>
        <div className="learning-grid">{resolvedLearning.map(item=><article key={item.id} className="learning-card">
          <div><span>{'MH'+item.after_gameweek+' sonrası'}</span><em>{learningStatus[item.status]||item.status}</em></div>
          <h3>{item.component}</h3><p>{item.signal}</p><strong>{item.evidence}</strong><small>{item.guardrail}</small>
        </article>)}</div></>:null}
      </div>:<div className="empty-learning-state">Güncel kurgu replay’i tamamlanınca öğrenme sinyalleri burada oluşacak.</div>}
    </section>

    {(replayPlayers.length||livePlayers.length)?<section className="card backtest-table-card">
      <div className="panel-head"><div><span className="eyebrow">OYUNCU BAZINDA</span><h2>En büyük sapmalar</h2></div></div>
      <div className="table-scroll"><table className="backtest-table">
        <thead><tr><th>Oyuncu</th><th>xFP</th><th>Tahmin bandı</th><th>Gerçek</th><th>Band sonucu</th><th>Band dışı</th><th>Merkez farkı</th><th>Ana hata alanı</th></tr></thead>
        <tbody>{[...replayPlayers,...livePlayers].slice(0,20).map((p,i)=>{const lo=p.predicted_p25??p.p25,hi=p.predicted_p90??p.p90;return <tr key={String(p.player_id)+'-'+i}>
          <td>{p.player_name}</td><td>{num(p.predicted_xfp)}</td><td>{lo===null||lo===undefined||hi===null||hi===undefined?'—':num(lo,0)+'–'+num(hi,0)}</td><td>{num(p.actual_points,0)}</td><td>{p.band_status||'—'}</td><td>{p.outside_band_distance===null||p.outside_band_distance===undefined?'—':num(p.outside_band_distance)}</td><td>{num(p.point_error??p.prediction_error)}</td><td>{p.main_error_area??p.error_component??'—'}</td>
        </tr>})}</tbody>
      </table></div>
    </section>:null}
  </main>
}
