import 'server-only'
import {createHash} from 'node:crypto'

export async function passwordPolicyCode(password){
  const value=String(password||'')
  if(value.length<8)return 'weak_password'

  const hash=createHash('sha1').update(value,'utf8').digest('hex').toUpperCase()
  const prefix=hash.slice(0,5)
  const suffix=hash.slice(5)

  try{
    const response=await fetch('https://api.pwnedpasswords.com/range/'+prefix,{
      headers:{
        'User-Agent':'Fantezi-Scout/1.0',
        'Add-Padding':'true',
      },
      cache:'no-store',
      signal:AbortSignal.timeout(5000),
    })
    if(!response.ok)return 'password_check_failed'
    const text=await response.text()
    const leaked=text.split(/\r?\n/).some(line=>{
      const [candidate,count]=line.split(':')
      return candidate===suffix&&Number(count)>0
    })
    return leaked?'leaked_password':null
  }catch{
    return 'password_check_failed'
  }
}
