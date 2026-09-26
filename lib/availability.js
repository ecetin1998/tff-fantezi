export const availabilityIsIssue=a=>{
  if(!a)return false
  return ['injuries','suspensions'].includes(a.availability_type) || Number(a.availability_probability??1)<.99
}

const cleanInternalText=value=>{
  let text=String(value||'').trim()
  if(!text)return ''
  if(/PENDING_DEPARTURE|Havuz:/i.test(text))return 'Kadro durumu teyit bekliyor'
  if(/Kaynakta belirtilen ceza bitişi geçti/i.test(text))return 'Ceza durumu yeniden kontrol ediliyor'
  text=text.replace(/\s*•\s*RC\d+[^•]*/gi,'')
    .replace(/\s*•\s*active-roster[^•]*/gi,'')
    .replace(/\s*•\s*formation\/mean[^•]*/gi,'')
    .replace(/\s*•\s*Bimodal[^•]*/gi,'')
    .replace(/\s+/g,' ')
    .trim()
  return text
}

export const availabilityExpectedReturn=value=>{
  const text=String(value||'').trim()
  if(!text)return ''
  return text.replace(/^(.+?) ayı başında (\d{4})$/i,'$1 $2 başı')
}

export const availabilityReason=a=>{
  if(!a)return ''
  return cleanInternalText(a.reason || a.source_reason || '')
}

export const availabilityCompactNote=a=>{
  if(!a)return ''
  const reason=availabilityReason(a)
  if(a.suspension_fixture){
    return [reason||'Ceza',a.suspension_fixture].filter(Boolean).join(' • ')
  }
  const expected=availabilityExpectedReturn(a.expected_return)
  if(expected){
    return [reason,'Dönüş: '+expected].filter(Boolean).join(' • ')
  }
  return reason
}

export const availabilityStatusLabel=a=>{
  if(!a)return '—'
  if(a.availability_type==='injuries')return 'Sakatlık'
  if(a.availability_type==='suspensions')return 'Ceza'
  if(a.availability_type==='return')return 'Dönüş'
  if(a.availability_type==='baseline')return 'Kontrol'
  return a.availability_type||'—'
}
