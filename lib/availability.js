export const availabilityIsIssue=a=>{
  if(!a)return false
  return ['injuries','suspensions'].includes(a.availability_type) || Number(a.availability_probability??1)<.99
}

const cleanInternalText=value=>{
  let text=String(value||'').trim()
  if(!text)return ''
  if(/PENDING_DEPARTURE|Havuz:/i.test(text))return 'Kadro durumu teyit bekliyor'
  if(/Kaynakta belirtilen ceza bitişi geçti/i.test(text))return 'Ceza durumu yeniden kontrol ediliyor'
  text=text
    .split(/\s*(?:\||•)\s*Rechecked\b/i)[0]
    .replace(/\s*•\s*RC\d+[^•]*/gi,'')
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
  const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!iso)return ''
  const date=new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`)
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(date)
}

export const availabilityReason=a=>{
  if(!a)return ''
  return cleanInternalText(a.canonical_reason || '')
}

export const availabilityCompactNote=a=>{
  if(!a)return ''
  const reason=availabilityReason(a)
  if(a.suspension_fixture){
    return [reason||'Ceza',a.suspension_fixture].filter(Boolean).join(' • ')
  }
  return reason
}

export const availabilityStatusLabel=a=>{
  if(!a)return '—'
  if(a.availability_type==='injuries'){
    const p=Number(a.availability_probability??1)
    return p>0&&p<1?'Riskli':'Sakatlık'
  }
  if(a.availability_type==='suspensions')return 'Ceza'
  if(a.availability_type==='return')return 'Aktif'
  if(a.availability_type==='baseline')return 'Kontrol'
  return a.availability_type||'—'
}


const turkishMonthName=m=>['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][Number(m)]||''
export const availabilityDateLabel=value=>{
  const text=String(value||'').trim()
  if(!text)return ''
  const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(iso)return `${Number(iso[3])} ${turkishMonthName(iso[2])} ${iso[1]}`
  return text
}
export const availabilityReturnLabel=a=>{
  if(!a)return ''
  const raw=String(a.expected_return||'').trim()
  if(raw){
    const normalized=raw.toLocaleLowerCase('tr-TR')
    const month=normalized.match(/(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/)
    const year=normalized.match(/20\d{2}/)?.[0]
    if(month&&year){
      const period=normalized.includes('baş')?'başı':normalized.includes('orta')?'ortası':normalized.includes('son')?'sonu':''
      return `${month[1][0].toLocaleUpperCase('tr-TR')+month[1].slice(1)} ${year}${period?' '+period:''}`
    }
    return raw
  }
  return availabilityDateLabel(a.expected_return_date)
}
export const availabilityDetailLine=a=>{
  if(!a)return ''
  const status=availabilityStatusLabel(a)
  const reason=availabilityReason(a)
  const eventDate=a.availability_type==='suspensions'?availabilityDateLabel(a.suspension_end):availabilityDateLabel(a.injury_date)
  const returnValue=a.availability_type==='suspensions'?(a.suspension_fixture||''):availabilityReturnLabel(a)
  return [
    [status,reason].filter(Boolean).join(' / '),
    eventDate?`${a.availability_type==='suspensions'?'Ceza tarihi':'Sakatlık tarihi'} = ${eventDate}`:'',
    returnValue?`${a.availability_type==='suspensions'?'Ceza maçı':'Beklenen dönüş tarihi'} = ${returnValue}`:''
  ].filter(Boolean).join(' • ')
}
