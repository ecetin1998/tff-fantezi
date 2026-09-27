export function normalizeIngestName(value){
  if(value===null||value===undefined)return null
  return String(value).normalize('NFC').replace(/\u0307/g,'').trim()
}

export function normalizeShirtNumber(value){
  if(value===null||value===undefined||value==='')return null
  const number=Number(value)
  if(!Number.isFinite(number)||number===0)return null
  return number
}
