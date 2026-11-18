import Link from 'next/link'
import {notFound} from 'next/navigation'
import {getAuthState,getModelHealthOverview,getFrozenMatchCalibration} from '@/lib/data'

export const metadata={title:'Model Sağlığı'}
export const revalidate=60
const fmtDate=value=>value?new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(value)):'—'
const status=ok=>ok===true?'PASS':ok===false?'FAIL':'—'
const pct=value=>value===null||value===undefined||!Number.isFinite(Number(value))?'—':(Number(value)*100).toFixed(1).replace('.',',')+'%'
const dec=value=>value===null||value===undefined||!Number.isFinite(Number(value))?'—':Number(value).toFixed(4).replace('.',',')

export default async function ModelHealth(){
  const auth=await getAuthState()
  if(auth.email!=='dummy.pro.20261001@example.com'||auth.plan!=='pro')notFound()
  const [health,calibration]=await Promise.all([getModelHealthOverview(),getFrozenMatchCalibration()])
  const {run,qa,gate,coverage={},ageHours,decisionAt}=health||{}
  const fresh=Number.isFinite(Number(ageHours))&&Number(ageHours)<=24
  const summary=calibration?.overall||null
  const warnings=calibration?.over25_review

  return <div className="model-health-page">
    <div className="section-title">
      <div><span className="eyebrow">MODEL OPERASYONU</span><h1>Model Sağlığı</h1>
        <p className="muted">Canlı run, QA, veri kapsamı ve tazelik kontrolleri.</p>
      </div>
      <span className={'model-health-state '+(run?.status==='ready'?'ok':'warn')}>
        {run?.status==='ready'?'HAZIR':'KONTROL'}
      </span>
    </div>
    <section className="model-health-grid">
      <div className="card model-health-card"><span>Canlı run</span><b>MH{run?.gameweek||'—'}</b><small>{Number(run?.simulation_count||0).toLocaleString('tr-TR')} sim • {fmtDate(run?.generated_at)}</small></div>
      <div className={'card model-health-card '+(qa?.pass?'ok':'warn')}><span>QA</span><b>{status(qa?.pass)}</b><small>{fmtDate(qa?.recorded_at)}</small></div>
      <div className={'card model-health-card '+(gate?.data_integrity_pass?'ok':'warn')}><span>Veri bütünlüğü</span><b>{status(gate?.data_integrity_pass)}</b><small>Yayın kapısı</small></div>
      <div className={'card model-health-card '+(fresh?'ok':'warn')}><span>Uygunluk tazeliği</span><b>{fresh?'TAZE':'KONTROL'}</b><small>{decisionAt?fmtDate(decisionAt):'Zaman bilinmiyor'}</small></div>
    </section>
    <section className="card model-health-coverage">
      <div className="panel-head"><div><span className="eyebrow">KAPSAM</span><h2>Canlı veri zinciri</h2></div><Link className="pill" href="/backtest">Model Performansı →</Link></div>
      <div className="model-health-coverage-grid">
        <div><span>Projection</span><b>{coverage.projections||0}</b><small>oyuncu</small></div>
        <div><span>Uygunluk</span><b>{coverage.availability||0}</b><small>oyuncu</small></div>
        <div><span>Rol sinyali</span><b>{coverage.roles||0}</b><small>oyuncu</small></div>
        <div><span>Takım profili</span><b>{coverage.teams||0}</b><small>takım</small></div>
      </div>
    </section>
    <section className="card model-health-gates">
      <div className="panel-head"><div><span className="eyebrow">YAYIN KAPILARI</span><h2>PASS / FAIL</h2></div></div>
      <div className="detail-list">
        <div><span>QA gate</span><b>{status(gate?.qa_pass)}</b></div>
        <div><span>Data integrity</span><b>{status(gate?.data_integrity_pass)}</b></div>
        <div><span>Optimizer</span><b>{status(gate?.optimizer_pass)}</b></div>
        <div><span>Artefact zinciri</span><b>{status(gate?.artifacts_pass)}</b></div>
        <div><span>Son kontrol</span><b>{fmtDate(gate?.checked_at)}</b></div>
        <div><span>Run kaynak güncelleme</span><b>{fmtDate(run?.source_updated_at)}</b></div>
      </div>
    </section>
    <section className="card model-match-calibration" aria-labelledby="match-calibration-title">
      <div className="panel-head">
        <div><span className="eyebrow">P1 • MAÇ OLASILIKLARI</span><h2 id="match-calibration-title">Gol ve clean sheet kalibrasyonu</h2></div>
        {summary?<span className={'model-calibration-state '+(warnings?'needs-review':'diagnostic')}>{warnings?'İnceleme sinyali':'Tanısal ölçüm'}</span>:null}
      </div>
      {summary&&summary.matches>0?<div>
        <p className="model-calibration-explain">Yalnız maç başlamadan önce dondurulmuş tahminlerle resmen kapanmış maçlar karşılaştırıldı. <strong>{summary.matches} maç</strong> • her alan için tahmin edilen oran ve gerçekleşen oran. Bu rapor modeli otomatik değiştirmez.</p>
        <div className="model-calibration-grid">
          {[
            ['3+ gol',summary.over25,summary.over25_brier],
            ['Karşılıklı gol',summary.btts,summary.btts_brier],
            ['Ev sahibi gol yemedi',summary.home_cs,summary.home_cs_brier],
            ['Deplasman gol yemedi',summary.away_cs,summary.away_cs_brier]
          ].map(([label,metric,brier])=><div key={label}>
            <span>{label}</span>
            <div><strong>{pct(metric?.predicted)}</strong><span aria-hidden="true">→</span><strong>{pct(metric?.observed)}</strong></div>
            <small>Model → gerçekleşen • Brier {dec(brier)}</small>
            <small>Gerçekleşen %95 aralık: {pct(metric?.observed_ci95?.lower)}–{pct(metric?.observed_ci95?.upper)}</small>
          </div>)}
        </div>
        <div className="model-calibration-table-wrap">
          <table className="model-calibration-table">
            <thead><tr><th>Hafta</th><th>Maç</th><th>1X2 Brier</th><th>3+ gol model</th><th>3+ gol gerçek</th><th>KG Brier</th></tr></thead>
            <tbody>{calibration.weeks.map(w=><tr key={w.gameweek}>
              <td>MH{w.gameweek}</td><td>{w.matches}</td><td>{dec(w.result_brier)}</td>
              <td>{pct(w.over25.predicted)}</td><td>{pct(w.over25.observed)}</td>
              <td>{dec(w.btts_brier)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="model-calibration-disclaimer">Brier için düşük değer daha iyi. {warnings?'3+ gol oranında gözlemsel fark belirgin; bağımsız yeni hafta doğrulaması olmadan model ağırlığını değiştirme.':'Bu örneklemde otomatik ağırlık değişikliğini gerektiren bir terfi kararı verilmedi.'} Görülen %95 Wilson aralıkları örneklem belirsizliğini gösterir; maçlar arası bağımlılığı veya veri seçimini düzeltmez. Beş haftalık yaklaşık 45 maçlık geçmiş, bağımsız ileriye dönük kalibrasyon kanıtı değildir. Eşikler yalnız inceleme amaçlıdır.</p>
      </div>:<p className="model-calibration-explain">Kapsamı doğrulanmış maç öncesi tahmin ile kapanmış maç sonuçları şu anda eşleştirilemedi. Tahmin yoksa başarı veya %0 gösterilmez.</p>}
    </section>
  </div>
}
