import {notFound} from 'next/navigation'
import {renderRolesPage} from '../page'

export const revalidate=300
export const dynamicParams=false
const PAGE_SIZE=100

export function generateStaticParams(){
  // The Pro role dataset is request-authorized. Never touch cookies/auth during build-time param generation.
  // 529 players currently fit in six 100-row pages; extra params are harmless and keep this route static.
  return Array.from({length:5},(_,i)=>({page:String(i+2)}))
}

export default async function RolesPaged({params}){
  const {page}=await params
  const n=Number(page)
  if(!Number.isInteger(n)||n<2)notFound()
  return renderRolesPage(n)
}
