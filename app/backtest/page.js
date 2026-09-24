import { getBacktestOverview } from '@/lib/data'

export const dynamic='force-dynamic'

const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)
const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
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
  const {replayWeeks,liveWeeks,learning,replayPlayers,livePlayers,preseasonCoverage}=await getBacktestOverview()
  const replayClosed=replayWeeks.filter(w=>w.status==='closed')
  const latestLive=liveWeeks.length?liveWeeks[liveWeeks.length-1]:null
  const benchmark=replayWeeks[0]?.engine_version||'ScoutPlus 3.1'
  const replayN=replayClosed.reduce((s,w)=>s+Number(w.player_sample||0),0)
  const overallBand=replayN?replayClosed.reduce((s,w)=>s+Number(w.band_hit_rate||0)*Number(w.player_sample||0),0)/replayN:null
  const overallOutside=replayN?replayClosed.reduce((s,w)=>s+Number(w.average_outside_distance||0)*Number(w.player_sample||0),0)/replayN:null

  return <main className="page-shell backtest-page">
    <section className="page-hero backtest-hero">
      <div>
        <span className="eyebrow">GÜNCEL MODELİN GERİYE DÖNÜK TESTİ</span>
        <h1>Model Performansı</h1>
        <p>Burada eski model sürümlerini değil, bugün kullandığımız kurguyu geçmiş maç haftalarına yeniden uyguluyoruz. Her hafta için yalnız o haftanın ilk maçı başlamadan önce bilinebilecek veriler kullanılıyor; gerçek sonuçlar tahmin tamamlandıktan sonra açılıyor.</p>
      </div>
      <div className="backtest-live-badge">
        <small>Bugünkü motor</small>
        <b>{benchmark.replace('ScoutPlus ','v').replace('Cold Start','Başlangıç Modeli')}</b>
        <span>Eski modeller dahil değil</span>
      </div>
    </section>

    <section className="backtest-summary-grid">
      <article className="card"><span>Güncel kurgu ile tamamlanan test</span><b>{replayClosed.length}<small>/6</small></b><small>MH1–MH6 bugünkü kurgu ile tamamlandı</small></article>
      <article className="card"><span>Tahmin bandında kalan</span><b>{pct(overallBand)}</b><small>P25–P90 bandı • beklenen kapsama yaklaşık %65</small></article>
      <article className="card"><span>Band dışına çıkınca ortalama sapma</span><b>{num(overallOutside)}</b><small>Yalnız tahmin bandının dışındaki puan mesafesi</small></article>
      <article className="card"><span>Şu an takip edilen hafta</span><b>{latestLive?'MH'+latestLive.gameweek:'—'}</b><small>{latestLive?liveStatus[latestLive.status]||latestLive.status:'Canlı kayıt yok'}</small></article>
    </section>

    <section className="card backtest-method">
      <div className="panel-head">
        <div><span className="eyebrow">TEST KURALI</span><h2>Sonucu görmeden tahmin et</h2></div>
      </div>
      <div className="backtest-explainer">
        <div><b>Güncel model testi</b><p>MH4 testinde model yalnız MH1–MH3 verisini görebilir. MH4 ve sonrasındaki hiçbir sonuç, dakika, xG veya fantezi puanı tahmine giremez.</p></div>
        <div><b>Başlangıç Modeli v1</b><p>MH1’de 2025-26 takım gücü, tarihli oyuncu verisi ve mevki ortalaması kullanılır. {preseasonCoverage?.players||0} oyuncuda bireysel başlangıç verisi vardır; kalanlarda daha düşük güvenli mevki priorı kullanılır.</p></div>
        <div><b>Eski modeller yok</b><p>v4.2, v4.3f veya eski dondurulmuş xFP değerleri güncel modelin başarı hesabına dahil edilmez. Yalnız o tarihte bilinebilen ham geçmiş gerçekler kullanılır.</p></div>
      </div>
    </section>

    <section className="card backtest-table-card">
      <div className="panel-head">
        <div><span className="eyebrow">GÜNCEL KURGU • MH1–MH6</span><h2>Hafta hafta geriye dönük test</h2></div>
        <small>Bu tablo tamamlandığında bugünkü modelin geçmişte ne yapacağını gösterecek.</small>
      </div>
      <div className="table-scroll">
        <table className="backtest-table replay-table">
          <thead><tr>
            <th>MH</th><th>Modelin bildiği veri</th><th>Oyuncu</th><th>Band içinde</th><th>Band genişliği</th><th>Band dışı sapma</th><th>Model eğilimi</th><th>Sıralama uyumu</th><th>İlk 25</th><th>Dakika hatası</th><th>Ana öğrenme</th><th>Durum</th>
          </tr></thead>
          <tbody>{replayWeeks.map(w=><tr key={w.gameweek} className={w.status==='cold_start_gap'?'replay-gap-row':''}>
            <td><b>{'MH'+w.gameweek}</b></td>
            <td>{w.data_through_gameweek===0?'Sezon öncesi / sıfır lig haftası':'MH1–MH'+w.data_through_gameweek}</td>
            <td>{w.player_sample??'—'}</td>
            <td><b>{pct(w.band_hit_rate)}</b></td>
            <td>{w.average_band_width===null||w.average_band_width===undefined?'—':num(w.average_band_width)+' puan'}</td>
            <td>{w.average_outside_distance===null||w.average_outside_distance===undefined?'—':num(w.average_outside_distance)+' puan'}</td>
            <td>{tendency(w.model_tendency)}</td>
            <td>{w.ranking_alignment===null||w.ranking_alignment===undefined?'—':num(w.ranking_alignment,2)+' / 1.00'}</td>
            <td>{pct(w.top25_hit_rate)}</td>
            <td>{w.average_minute_error===null||w.average_minute_error===undefined?'—':num(w.average_minute_error,1)+' dk'}</td>
            <td className="learning-cell">{w.main_learning||'—'}</td>
            <td><span className={'replay-status '+w.status}>{replayStatus[w.status]||w.status}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="backtest-notes">
        {replayWeeks.map(w=><div key={'replay-note-'+w.gameweek}><b>{'MH'+w.gameweek}</b><span>{w.notes}</span></div>)}
      </div>
    </section>

    <section className="card metric-guide">
      <div className="panel-head"><div><span className="eyebrow">NE ANLAMA GELİYOR?</span><h2>Terimleri sade okuyalım</h2></div></div>
      <div className="metric-guide-grid">
        <div><b>Tahmin bandında kalma</b><p>P25–P90 aralığı modelin ürettiği olası sonuç alanıdır. Bu aralığın teorik kapsaması yaklaşık <strong>%65</strong>. Gerçek sonuç bandın içindeyse dağılım tahmini başarılı sayılır; oran çok yüksekse bandın gereğinden geniş olabileceğini de kontrol ederiz.</p></div>
        <div><b>Band dışı sapma</b><p>Gerçek sonuç bandın dışına çıktıysa yalnız en yakın sınırdan uzaklığı ölçeriz. Örn. xFP 5, bant 2–13 ve gerçek 18 ise <strong>13 puan hata değil, band dışı 5 puan</strong> olarak değerlendirilir.</p></div>
        <div><b>Band genişliği</b><p>Belirsizliği ne kadar geniş bıraktığımızı gösterir. Sadece kapsama oranını yükseltmek için bandı sonsuza kadar açmak başarı değildir; amaç doğru kapsama + mümkün olduğunca keskin aralıktır.</p></div>
        <div><b>Model eğilimi</b><p>Merkez xFP’nin uzun vadede sistematik olarak fazla mı az mı kaldığını gösterir. Tek oyuncunun uç sonucu değil, tekrar eden yönlü sapma önemlidir.</p></div>
        <div><b>Sıralama ve dakika</b><p>Sıralama uyumu yüksek gördüğümüz oyuncuların gerçekten yukarı çıkıp çıkmadığını; dakika hatası ise rol/ilk 11 tahminimizin doğruluğunu gösterir. Öğrenme kararlarında ikisini birlikte kullanırız.</p></div>
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
      {learning.length?<div className="learning-grid">{learning.map(item=><article key={item.id} className="learning-card">
        <div><span>{'MH'+item.after_gameweek+' sonrası'}</span><em>{learningStatus[item.status]||'İzleniyor'}</em></div>
        <h3>{item.component}</h3><p>{item.signal}</p><strong>{item.evidence}</strong><small>{item.guardrail}</small>
      </article>)}</div>:<div className="empty-learning-state">Güncel kurgu replay’i tamamlanınca öğrenme sinyalleri burada oluşacak.</div>}
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
