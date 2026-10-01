import squadLegacy from '@/components/SquadBuilderLegacy.module.css'
import managerCards from '@/components/ManagerCards.module.css'

export default function SquadRecommendationsLayout({children}){
  return <div className={[squadLegacy.scope,managerCards.scope].join(' ')}>{children}</div>
}
