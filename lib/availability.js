export const availabilityIsIssue=a=>{
  if(!a)return false
  return ['injuries','suspensions'].includes(a.availability_type) || Number(a.availability_probability??1)<.99
}

export const availabilityReason=a=>{
  if(!a)return ''
  return a.reason || a.source_reason || ''
}

export const availabilityCompactNote=a=>{
  if(!a)return ''
  const reason=availabilityReason(a)
  if(a.suspension_fixture){
    return [reason||'Ceza',a.suspension_fixture].filter(Boolean).join(' • ')
  }
  if(a.expected_return){
    return [reason,'Dönüş: '+a.expected_return].filter(Boolean).join(' • ')
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
