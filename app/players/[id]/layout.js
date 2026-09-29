import analysisViews from '@/components/AnalysisViews.module.css'

export default function PlayerDetailLayout({children}){
  return <div className={analysisViews.scope}>{children}</div>
}
