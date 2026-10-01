import squadLegacy from '@/components/SquadBuilderLegacy.module.css'
import squadWorkspace from '@/components/SquadWorkspace.module.css'
import managerCards from '@/components/ManagerCards.module.css'

export default function SquadLayout({children}){
  return <div className={[squadLegacy.scope,squadWorkspace.scope,managerCards.scope].join(' ')}>{children}</div>
}
