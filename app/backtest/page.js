import { getBacktestOverview } from '@/lib/data'

export const dynamic='force-dynamic'

export default async function BacktestPage(){
  const {weeks}=await getBacktestOverview()
  return <main className="page-shell backtest-page">
    <section className="page-hero">
      <div>
        <span className="eyebrow">MODEL ÖĞRENME DÖNGÜSÜ</span>
        <h1>Model Performansı</h1>
        <p>{weeks.length} haftalık kayıt bulundu.</p>
      </div>
    </section>
  </main>
}
