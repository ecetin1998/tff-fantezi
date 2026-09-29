import analysisViews from '@/components/AnalysisViews.module.css'

export default function BacktestLayout({children}){
  return <div className={analysisViews.scope}>{children}</div>
}
