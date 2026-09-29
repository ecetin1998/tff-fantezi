import squadLegacy from '@/components/SquadBuilderLegacy.module.css'
import squadWorkspace from '@/components/SquadWorkspace.module.css'

export default function SquadLayout({children}){
  return <div className={[squadLegacy.scope,squadWorkspace.scope].join(' ')}>{children}</div>
}
