import legacyViews from '@/components/SquadBuilderLegacy.module.css'
import analysisViews from '@/components/AnalysisViews.module.css'

export default function TeamDetailLayout({children}){
  const scope=[legacyViews.scope,analysisViews.scope].join(' ')
  return <div className={scope}>{children}</div>
}
