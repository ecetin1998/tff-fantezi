/**
 * Player comparison uses only metrics available to this user's access tier.
 * Do not upgrade missing private stats to zero or treat a pending overlay as 0%.
 */
const available=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))
const n=value=>available(value)?Number(value):null
const format=(value,type)=>{
  if(!available(value))return '—'
  if(type==='percentage')return Math.round(Number(value)*100)+'%'
  if(type==='minutes')return Math.round(Number(value))+' dk'
  if(type==='price')return Number(value).toFixed(1)+'m'
  if(type==='points')return Number(value).toFixed(0)
  return Number(value).toFixed(2)
}
const metrics=[
  {key:'xfp',name:'Beklenen puan',type:'decimal',extract:p=>p?.projection?.xfp},
  {key:'xi',name:'İlk 11',type:'percentage',extract:p=>p?.projection?.xi_probability},
  {key:'minutes',name:'Beklenen dakika',type:'minutes',extract:p=>p?.projection?.x_minutes},
  {key:'price',name:'Fiyat',type:'price',extract:p=>p?.price},
  {key:'value',name:'F/P',type:'decimal',extract:p=>p?.projection?.value_score},
  {key:'total',name:'Sezon puanı',type:'points',extract:p=>p?.total_points},
  {key:'availability',name:'Oynama uygunluğu',type:'percentage',extract:p=>p?.projection?.availability_probability},
]
const advanced=[
  {key:'p90',name:'P90',type:'decimal',extract:p=>p?.projection?.p90},
  {key:'six',name:'6+ puan ihtimali',type:'percentage',extract:p=>p?.projection?.six_plus_probability}
]
export function comparePlayerMetrics(a,b,{isPro=false,proReady=false}={}){
  if(!a||!b||Number(a.id)===Number(b.id))return []
  return [...metrics,...(isPro&&proReady?advanced:[])].map(metric=>{
    const first=n(metric.extract(a)),second=n(metric.extract(b))
    const better=first===null||second===null||first===second?'tie':
      (metric.key==='price'?first<second:first>second)?'left':'right'
    return {key:metric.key,label:metric.name,first:format(first,metric.type),
      second:format(second,metric.type),better}
  })
}
