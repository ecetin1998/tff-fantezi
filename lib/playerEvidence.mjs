/**
 * Player data provenance display. These values document the origin and cutoff
 * of evidence; they are NOT calibrated probabilities that a prediction is right.
 * No live/frozen forecast is recalculated here.
 */
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
const fmtDate=value=>{
  if(!value)return null
  const ts=Date.parse(value)
  if(!Number.isFinite(ts))return null
  return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Istanbul'}).format(new Date(ts))
}
const inSourceDate=source=>{
  const match=String(source||'').match(/(?:^|_)(20\d\d)-(\d{2})-(\d{2})(?:$|[_|])/)
  if(!match)return null
  const [_,year,month,day]=match
  const check=new Date(year+'-'+month+'-'+day+'T12:00:00Z')
  if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,10)!==year+'-'+month+'-'+day)return null
  return day+'.'+month+'.'+year
}
const coefficient=value=>finite(value)&&Number(value)>=0&&Number(value)<=1?Number(value).toFixed(2).replace('.',','):null

export function evidenceOrigin(source,{type='general'}={}){
  const name=String(source||'').toLowerCase()
  if(!name)return 'Kaynak belirtilmemiş'
  if(type==='role'&&name.includes('fantasy_position_fallback'))return 'Fantezi kayıtlı mevki (alt rol çıkarımı)'
  if(name.includes('verified_formation'))return 'Doğrulanmış maç dizilişi'
  if(name.includes('fotmob'))return 'FotMob kaynaklı'
  if(name.includes('transfermarkt'))return 'Transfermarkt / profil kaynaklı'
  if(name.includes('sofascore'))return 'Sofascore / profil kaynaklı'
  if(name.includes('position_prior'))return 'Mevki öncülü (gözlem değil)'
  if(name.includes('preseason_player_prior'))return 'Sezon öncesi oyuncu öncülü'
  if(name.includes('review')||name.includes('manual'))return 'İncelenmiş manuel kaynak'
  if(name.includes('verified'))return 'Doğrulanmış maç verisi'
  return 'Model / diğer kaynak'
}

export function evidenceWeekCoverage({currentWeek,seasonWeek,throughWeek}={}){
  const current=Number(currentWeek),season=Number(seasonWeek),through=Number(throughWeek)
  if(!finite(throughWeek)||!Number.isInteger(through)||through<1)return {value:'Bilinmiyor',detail:'Kapsama ilişkin doğrulanmış hafta bilgisi yok',missing:null}
  const lastClosed=Number.isInteger(season)&&season>0
    ? Math.min(season,Number.isInteger(current)&&current>0?current-1:season)
    : Number.isInteger(current)&&current>1?current-1:through
  const missing=Math.max(0,lastClosed-through)
  return {
    value:'MH1–MH'+through,
    detail:missing>0
      ?'Son '+missing+' tamamlanmış haftanın bu veri alanındaki kapsamı eksik'
      :'Tamamlanan haftalar bu veri alanında kapsanıyor',
    missing
  }
}

export function playerEvidenceSummary({run,player,season,availability}={}){
  const completed=season?.through_gameweek
  const roleSource=player?.role_source||null
  const xaSource=season?.xa_source||null
  const statsCoverage=evidenceWeekCoverage({currentWeek:run?.gameweek,seasonWeek:completed,throughWeek:season?.advanced_through_gameweek})
  const actionsCoverage=evidenceWeekCoverage({currentWeek:run?.gameweek,seasonWeek:completed,throughWeek:season?.advanced_actions_through_gameweek})
  const roleCoeff=coefficient(player?.role_confidence)
  const xaCoeff=coefficient(season?.xa_confidence)
  const xaOrigin=evidenceOrigin(xaSource)
  return {
    role:{
      title:'Mevki / alt rol',
      value:evidenceOrigin(roleSource,{type:'role'}),
      detail:[inSourceDate(roleSource)?'Kaynak tarihi '+inSourceDate(roleSource):null,
        roleCoeff?'Kaynak eşleştirme katsayısı '+roleCoeff:null].filter(Boolean).join(' • ')||'Son kaynak tarihi veya güven katsayısı kayıtlı değil',
      known:!!roleSource
    },
    xa:{
      title:'xA kaynağı',
      value:xaOrigin,
      detail:[inSourceDate(xaSource)?'Kaynak tarihi '+inSourceDate(xaSource):null,
        xaCoeff?'Veri güven katsayısı '+xaCoeff:null].filter(Boolean).join(' • ')||
        'Kaynak tarihi veya güven katsayısı kayıtlı değil',
      prior:xaOrigin.includes('öncülü'),
      known:!!xaSource
    },
    stats:{
      title:'Sezon ileri verisi',
      value:statsCoverage.value,
      detail:statsCoverage.detail+(fmtDate(season?.advanced_updated_at)?' • Son veri kaydı '+fmtDate(season.advanced_updated_at):''),
      missing:statsCoverage.missing
    },
    actions:{
      title:'Doğrulanmış maç aksiyonları',
      value:actionsCoverage.value,
      detail:actionsCoverage.detail+
        (finite(season?.advanced_actions_verified_appearances)?' • '+Number(season.advanced_actions_verified_appearances)+' kaynaklı maç kaydı':''),
      missing:actionsCoverage.missing
    },
    availability:{
      title:'Sakatlık / ceza kontrolü',
      value:fmtDate(availability?.checked_at)||'Tarih bilinmiyor',
      detail:availability?.checked_at?'Oyuncuya özel son uygunluk kaydı; oynama garantisi değildir':
        'Oyuncuya özel son kontrol zamanı kayıtlı değil',
      known:!!availability?.checked_at
    },
    model:{
      title:'Model ve genel kaynak',
      value:fmtDate(run?.generated_at)||'Bilinmiyor',
      detail:'Model koşusu'+(fmtDate(run?.source_updated_at)?' • Genel kaynak güncellemesi '+fmtDate(run.source_updated_at):' • Genel kaynak zamanı bilinmiyor')+
        ' • Bu tarih tüm oyuncu alanlarının güncel olduğunu göstermez'
    }
  }
}

export function xfpComponents(projection){
  const core=projection?.core_xfp,bonus=projection?.x_bonus,total=projection?.xfp
  if(!finite(core)||!finite(bonus)||!finite(total))return {available:false}
  const raw=Number(core)+Number(bonus)
  const diff=Math.abs(raw-Number(total))
  return {
    available:true,core:Number(core),bonus:Number(bonus),total:Number(total),
    consistent:diff<=0.025,
    reconciliation:diff<=0.025?'Bileşenler toplamla uyumlu (yuvarlama farkı olabilir)':
      'Bileşenler toplamı farklı; eksik bir alt etken olabilir',
    inputSignals:[
      {label:'İlk 11',value:finite(projection?.xi_probability)?Math.round(Number(projection.xi_probability)*100)+'%':'—'},
      {label:'Beklenen dakika',value:finite(projection?.x_minutes)?Math.round(Number(projection.x_minutes))+' dk':'—'},
      {label:'Oynama olasılığı',value:finite(projection?.appearance_probability)?Math.round(Number(projection.appearance_probability)*100)+'%':'—'}
    ]
  }
}
