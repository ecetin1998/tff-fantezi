import analysisViews from '@/components/AnalysisViews.module.css'

export default function TeamDetailLayout({children}){
  return <div className={analysisViews.scope}>{children}</div>
}
