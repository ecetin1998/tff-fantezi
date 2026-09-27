import Link from 'next/link'
import { getMatches } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'
import DataFreshnessBanner from '@/components/DataFreshnessBanner'
import {outcomePercentages} from '@/lib/format'

export const revalidate=300
export const metadata={title:'Maç Tahminleri'}

const matchupLabel={good:'Yüksek',neutral:'Orta',tough:'Düşük'}
const attackMatchupLevel=xg=>Number(xg)>=1.65?'good':Number(xg)<=1.15?'tough':'neutral'
const defenseMatchupLevel=cs=>Number(cs)>=.40?'good':Number(cs)<=.25?'tough':'neutral'

function balancedVariant(m){
  const homeXg=Number(m.home_xg||0),awayXg=Number(m.away_xg||0)
  const total=homeXg+awayXg
  const xgGap=Math.abs(homeXg-awayXg)
  const csGap=Math.abs(Number(m.home_cs_probability||0)-Number(m.away_cs_probability||0))
  if(total>=2.65&&xgGap<=.30)return 0
  if(csGap>=.10)return 1
  return 2
}

function balancedReading(m,variant){
  const homeXg=Number(m.home_xg||0),awayXg=Number(m.away_xg||0)
  const homeCs=Number(m.home_cs_probability||0),awayCs=Number(m.away_cs_probability||0)
  const attackSide=homeXg>=awayXg?'home':'away'
  const attackName=attackSide==='home'?m.home_team:m.away_team
  const attackTop=attackSide==='home'?m.home_fantasy?.top_attack:m.away_fantasy?.top_attack
  const value=(attackSide==='home'?m.home_fantasy:m.away_fantasy)?.best_value
  const safer=homeCs>=awayCs?m.home_team:m.away_team
  const templates=[
    'Toplam gol beklentisi canlı ama taraflar arasında net bir xG kopuşu yok; bitiricilik, duran top ve ceza sahası rolü oyuncu seçiminde ayrıştırıcı.',
    `Sonuç tarafı dengeli kalırken clean sheet ihtimali ${safer} lehine ayrışıyor; savunma seçimi ile hücum tavanını aynı maçta birlikte tartmak daha anlamlı.`,
    'xG ve clean sheet farkları dar; dakika güveni, duran top rolü ve ceza sahası aksiyonları takım isminden daha belirleyici.'
  ]
  return {
    label:'Dengeli risk',
    text:`${templates[variant]} ${attackTop?`${attackName} tarafında ${attackTop.name} ${attackTop.xfp.toFixed(1)} xFP ile öne çıkıyor.`:''} ${value&&value.player_id!==attackTop?.player_id&&value.xfp>=3.5?`Fiyat/performans tarafında ${value.name} da ${value.price.toFixed(1)}m fiyatıyla dikkat çekiyor.`:''}`.replace(/\s+/g,' ').trim()
  }
}
const profileClass=total=>total>=3?'high':total<=2?'low':'medium'
const pct=v=>Math.round(Number(v||0)*100)

function fantasyReading(m){
  const home=Number(m.home_win_probability||0),away=Number(m.away_win_probability||0)
  const homeXg=Number(m.home_xg||0),awayXg=Number(m.away_xg||0),total=homeXg+awayXg
  const homeCs=Number(m.home_cs_probability||0),awayCs=Number(m.away_cs_probability||0)
  const closeResult=Math.abs(home-away)<=.10

  const favSide=home>=away?'home':'away'
  const dogSide=favSide==='home'?'away':'home'
  const favName=favSide==='home'?m.home_team:m.away_team
  const dogName=dogSide==='home'?m.home_team:m.away_team
  const favWin=Math.max(home,away)
  const favXg=favSide==='home'?homeXg:awayXg
  const dogXg=dogSide==='home'?homeXg:awayXg
  const favCs=favSide==='home'?homeCs:awayCs
  const homeTop=m.home_fantasy?.top_attack
  const awayTop=m.away_fantasy?.top_attack
  const favFantasy=favSide==='home'?m.home_fantasy:m.away_fantasy
  const highCsSide=homeCs>=awayCs?'home':'away'
  const highCsName=highCsSide==='home'?m.home_team:m.away_team
  const highCs=highCsSide==='home'?homeCs:awayCs
  const highCsFantasy=highCsSide==='home'?m.home_fantasy:m.away_fantasy

  if(total>=3.15 && Math.min(homeXg,awayXg)>=1.10){
    const names=[homeTop,awayTop].filter(Boolean).map(p=>`${p.name} (${p.xfp.toFixed(1)} xFP)`).join(' ve ')
    return {
      label:'Açık maç',
      text:`İki taraf da gol üretmeye yeterince yakın; burada clean sheet kovalamaktan çok gol, asist ve bonus tavanı öne çıkıyor. ${names?names+' iki taraftaki öne çıkan fantasy çıkışları.':'Hücum rolleri savunma tabanından daha cazip.'}`
    }
  }

  if(favWin>=.60 && favXg-dogXg>=.55){
    const a=favFantasy?.top_attack
    const b=favFantasy?.second_attack
    const stack=a&&b&&a.xfp>=3.7&&b.xfp>=3.5
      ? `${a.name} ve ${b.name} aynı taraftan birlikte değerlendirilebilecek kadar güçlü projekte ediliyor.`
      : a ? `${a.name} ${a.xfp.toFixed(1)} xFP ile bu üstünlüğün en net fantasy karşılığı.` : ''
    return {
      label:'Tek taraflı baskı',
      text:`${favName} hem sonuç olasılığında hem xG farkında maçı belirgin biçimde önde oynuyor. ${stack} ${dogName} tarafında seçim yaparken skor bağımlılığı yüksek oyuncuların tabanı daha kırılgan.`.replace(/\s+/g,' ').trim()
    }
  }

  if(total<=2.05 && highCs>=.40){
    const d=highCsFantasy?.top_defense
    return {
      label:'Savunma maçı',
      text:`Model düşük gol hacmi bekliyor ve ${highCsName} için clean sheet olasılığı %${pct(highCs)}. ${d?`${d.name} (${d.xfp.toFixed(1)} xFP) savunma/kaleci hattında bu maçın en doğal fantasy çıkışlarından biri.`:'Savunma ve kaleci seçimi hücum stack’inden daha temiz görünüyor.'}`
    }
  }

  if(homeCs<.25 && awayCs<.25){
    const best=[homeTop,awayTop].filter(Boolean).sort((a,b)=>b.xfp-a.xfp)[0]
    return {
      label:'CS tuzağı',
      text:`İki tarafın clean sheet ihtimali de düşük; savunmacılar hücum katkısı üretmedikçe fiyatlarını çıkarmakta zorlanabilir. ${best?`${best.name} ${best.xfp.toFixed(1)} xFP ile maçın hücum tarafındaki en güçlü bireysel sinyali.`:'Hücum oyuncularının tavanı savunma tabanından daha değerli.'}`
    }
  }

  if(closeResult){
    const candidates=[homeTop,awayTop].filter(Boolean).sort((a,b)=>b.xfp-a.xfp)
    const top=candidates[0]
    return {
      label:'İnce marj',
      text:`Sonuç olasılıkları birbirine yakın; bu yüzden sadece “kazanan takım” üzerinden seçim yapmak zayıf bir yaklaşım. ${top?`${top.name} gibi doğrudan aksiyon üreten ve ${top.xfp.toFixed(1)} xFP taşıyan roller, maç sonucuna bağımlı seçimlerden daha güvenli bir çıkış sunuyor.`:'Duran top, şut ve yaratım rolü güçlü oyuncular daha anlamlı.'}`
    }
  }

  if(favWin>=.56 && favXg<1.70){
    const a=favFantasy?.top_attack
    const d=favFantasy?.top_defense
    return {
      label:'Kontrollü favori',
      text:`${favName} favori ama model maçı yüksek skorlu bir kopuşa taşımıyor. ${a&&d?`Bu profilde ${a.name} gibi tek ana hücum seçimiyle ${d.name} gibi savunma tabanını birleştirmek, ağır hücum stack’inden daha dengeli.`:'Tek premium hücum seçimi ile savunma tarafını birlikte düşünmek daha dengeli.'}`
    }
  }

  return null
}

export default async function Matches(){
  const {matches,run}=await getMatches()
  const balancedCounts=[0,0,0]
  const readings=new Map()
  for(const m of matches){
    let reading=fantasyReading(m)
    if(!reading){
      const preferred=balancedVariant(m)
      const candidates=[preferred,(preferred+1)%3,(preferred+2)%3]
      const selected=candidates.find(index=>balancedCounts[index]<2) ?? (Number(m.match_id||0)%3)
      balancedCounts[selected]+=1
      reading=balancedReading(m,selected)
    }
    readings.set(m.match_id,reading)
  }
  return <>
    <DataFreshnessBanner run={run}/>
    <div className="section-title">
      <div><span className="eyebrow">MAÇ MODELİ</span><h1>MH{run?.gameweek||'—'} Maç Tahminleri</h1></div>
      <span className="muted">xG • sonuç olasılığı • clean sheet • fantasy maç profili</span>
    </div>

    <div className="grid match-grid modern-match-grid match-analysis-grid">
      {matches.map(m=>{
        const home=Number(m.home_win_probability||0),draw=Number(m.draw_probability||0),away=Number(m.away_win_probability||0)
        const [homePct,drawPct,awayPct]=outcomePercentages(m)
        const homeXg=Number(m.home_xg||0),awayXg=Number(m.away_xg||0),totalXg=homeXg+awayXg
        const homeCs=Number(m.home_cs_probability||0),awayCs=Number(m.away_cs_probability||0)
        const attackEdge=homeXg===awayXg?null:(homeXg>awayXg?'home':'away')
        const cleanEdge=homeCs===awayCs?null:(homeCs>awayCs?'home':'away')
        const homeAttackLevel=attackMatchupLevel(homeXg)
        const awayAttackLevel=attackMatchupLevel(awayXg)
        const homeDefenseLevel=defenseMatchupLevel(homeCs)
        const awayDefenseLevel=defenseMatchupLevel(awayCs)
        const reading=readings.get(m.match_id)
        return <article className="card match-card modern-match-card match-analysis-card" key={m.match_id}>
          <div className="match-card-top">
            <span className="match-date-label">
              <b>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{weekday:'short',day:'2-digit',month:'short',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</b>
              <em>{m.kickoff_at?new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date(m.kickoff_at)):'—'}</em>
            </span>
            <span className={`match-profile-pill ${profileClass(totalXg)}`}>{reading.label}</span>
          </div>

          <div className="match-teams">
            <div className="match-team-block">
              <span>EV</span>
              <Link className="match-team-link" style={teamCssVars(m.home_team)} href={'/teams/'+m.home_team_id}><i className="club-dot"/><b>{m.home_team}</b></Link>
              <div className="match-team-meta matchup-badges">
                <em className={'matchup-pill '+homeAttackLevel}>Gol beklentisi: {matchupLabel[homeAttackLevel]||'Orta'}</em>
                <em className={'matchup-pill '+homeDefenseLevel}>CS şansı: {matchupLabel[homeDefenseLevel]||'Orta'}</em>
              </div>
            </div>

            <div className="xg-comparison fantasy-xg-comparison">
              <small>xG TAHMİNİ</small>
              <strong><b>{homeXg.toFixed(2)}</b><em>—</em><b>{awayXg.toFixed(2)}</b></strong>
              <span>Toplam {totalXg.toFixed(2)}</span>
            </div>

            <div className="away match-team-block">
              <span>DEP</span>
              <Link className="match-team-link away-link" style={teamCssVars(m.away_team)} href={'/teams/'+m.away_team_id}><i className="club-dot"/><b>{m.away_team}</b></Link>
              <div className="match-team-meta away-meta matchup-badges">
                <em className={'matchup-pill '+awayAttackLevel}>Gol beklentisi: {matchupLabel[awayAttackLevel]||'Orta'}</em>
                <em className={'matchup-pill '+awayDefenseLevel}>CS şansı: {matchupLabel[awayDefenseLevel]||'Orta'}</em>
              </div>
            </div>
          </div>

          <div className="outcome-bar outcome-bar-labeled" aria-label="Maç sonucu olasılıkları">
<i className="home" style={{width:homePct+'%'}} title={`Ev %${homePct}`}><span><b>{homePct}%</b> Ev</span></i>
<i className="draw" style={{width:drawPct+'%'}} title={`Beraberlik %${drawPct}`}><span><b>{drawPct}%</b> Ber.</span></i>
<i className="away" style={{width:awayPct+'%'}} title={`Dep %${awayPct}`}><span><b>{awayPct}%</b> Dep</span></i>
          </div>

          <div className="match-fantasy-meta fantasy-first-meta">
            <span className={attackEdge==='home'?'edge':''}><small>{m.home_team} hücum</small><b>{homeXg.toFixed(2)} xG</b></span>
            <span className={cleanEdge==='home'?'edge':''}><small>{m.home_team} CS</small><b>{(homeCs*100).toFixed(0)}%</b></span>
            <span className={attackEdge==='away'?'edge':''}><small>{m.away_team} hücum</small><b>{awayXg.toFixed(2)} xG</b></span>
            <span className={cleanEdge==='away'?'edge':''}><small>{m.away_team} CS</small><b>{(awayCs*100).toFixed(0)}%</b></span>
          </div>

          <div className="match-fantasy-note">
            <span>FANTASY OKUMASI • {reading.label.toLocaleUpperCase('tr')}</span>
            <p>{reading.text}</p>
          </div>

          <details className="match-technical-details">
            <summary>Teknik maç detayları <span>+</span></summary>
            <div>
              <small>{m.home_team} xG</small><b>{homeXg.toFixed(2)}</b>
              <small>{m.away_team} xG</small><b>{awayXg.toFixed(2)}</b>
              <small>Model haftası</small><b>MH{run?.gameweek||'—'}</b>
<small>1-X-2</small><b>{homePct}% / {drawPct}% / {awayPct}%</b>
            </div>
            <p className="elo-explainer">Bu alan yalnız yayınlanan maç modeli değerlerini gösterir; arayüzde ayrı bir runtime Elo sinyali hesaplanmaz.</p>
          </details>
        </article>
      })}
    </div>
  </>
}
