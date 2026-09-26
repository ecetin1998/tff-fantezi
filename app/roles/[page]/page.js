import {notFound} from 'next/navigation'
import {getRoleSignals} from '@/lib/data'
import {renderRolesPage} from '../page'

export const revalidate=300
export const dynamicParams=false
const PAGE_SIZE=100

export async function generateStaticParams(){
  const {rows}=await getRoleSignals()
  const pageCount=Math.max(1,Math.ceil((rows||[]).length/PAGE_SIZE))
  return Array.from({length:Math.max(0,pageCount-1)},(_,i)=>({page:String(i+2)}))
}

export default async function RolesPaged({params}){
  const {page}=await params
  const n=Number(page)
  if(!Number.isInteger(n)||n<2)notFound()
  return renderRolesPage(n)
}
