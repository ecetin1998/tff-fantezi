'use client'

import {useFormStatus} from 'react-dom'

export default function VerifyEmailButton(){
  const {pending}=useFormStatus()
  return <button className="secondary" type="submit" disabled={pending} aria-busy={pending} style={{opacity:pending?.7:1,cursor:pending?'wait':'pointer'}}>{pending?'Doğrulama e-postası gönderiliyor…':'E-postamı doğrula'}</button>
}
