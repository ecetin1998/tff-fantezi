import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthState, getTeamDetail, getTeamFixturesOverview } from '@/lib/data'
import AccessGate from '@/components/AccessGate'
import { teamCssVars } from '@/lib/teamThemes'
import TeamRoster from '@/components/TeamRoster'
import {playerLabel} from '@/lib/playerPresentation'

export const revalidate=300
export const dynamic='force-dynamic'
export async function generateStaticParams(){
  const {teams}=await getTeamFixturesOverview()
  const ids=[...new Set((teams||[]).map(t=>Number(t.id)).filter(Boolean))]
  return ids.map(id=>({id:String(id)}))
}
export async function generateMetadata({params}){
  const {id}=await params
  const data=await getTeamDetail(id)
  if(!data)notFound()
  return {title:data.team.name+' • Takım Analizi',description:data.team.name+' için xG/xGA, fikstür ve fantezi oyuncu analizi.'}
}

const pct=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'
const num=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d)
const posLabel=p=>({GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}[p]||p||'—')

export default async function TeamPage({params}){
  const {id}=await params
  const auth=await getAuthState()
  const isPro=auth.plan==='pro'
  if(!isPro)return <div className="team-player-page detail-pro-gate-page">
    <Link href="/teams" className="back-link">← Takımlara dön</Link>
    <AccessGate
      tier="pro"
      eyebrow="GELİŞMİŞ • DETAY ANALİZ"
      title="Takım detay analizi Gelişmiş üyelikte."
      description="Takımın xG/xGA profili, fantezi karar özeti, oyuncu havuzu, maç geçmişi ve gelişmiş hücum-savunma analizi için Gelişmiş üyeliğe geç."
    />
  </div>
  const data=await getTeamDetail(id)
  if(!data) notFound()

  const {team,run,season:s,tactical,history,currentMatches=[],currentMatch,opponent,players,fantasyByGameweek}=data
  const isHome=currentMatch?Number(currentMatch.home_team_id)===Number(team.id):false
  const teamXg=currentMatch?(isHome?currentMatch.home_xg:currentMatch.away_xg):null
  const oppXg=currentMatch?(isHome?currentMatch.away_xg:currentMatch.home_xg):null
  const win=currentMatch?(isHome?currentMatch.home_win_probability:currentMatch.away_win_probability):null
  const cs=currentMatch?(isHome?currentMatch.home_cs_probability:currentMatch.away_cs_probability):null

  const played=(history||[]).filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.away_goals!==null&&m.away_goals!==undefined)
  const fantasyWeeks=Object.entries(fantasyByGameweek||{}).sort((a,b)=>Number(a[0])-Number(b[0]))
  const matchesPlayed=Number(s?.matches_played||0)
  const safeMatches=Math.max(1,matchesPlayed)
  const goalsPerMatch=Number(s?.goals_for||0)/safeMatches
  const concededPerMatch=Number(s?.goals_against||0)/safeMatches
  const shotsPerMatch=Number(s?.shots||0)/safeMatches
  const oppSotPerMatch=Number(s?.opponent_sot||0)/safeMatches
  const finishingDelta=Number(s?.goals_for||0)-Number(s?.xg_total||0)
  const defensiveDelta=Number(s?.xga_total||0)-Number(s?.goals_against||0)
  const xgDiffPerMatch=Number(s?.xg_diff||0)/safeMatches
  const tacticalCoverage=tactical?.coverage||'aggregate_only'
  const hasEventProfile=Number(tactical?.event_shot_sample||0)>0
  const hasAdvancedProfile=Number(tactical?.advanced_profile_matches||0)>0
  const hasInferredChannels=tactical?.inferred_attack_left_share!==null&&tactical?.inferred_attack_left_share!==undefined
  const idx=v=>v===null||v===undefined?'—':Number(v).toFixed(2)+'×'
  const pctShare=v=>v===null||v===undefined?'—':(Number(v)*100).toFixed(0)+'%'

  const sortedPlayers=[...(players||[])].sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))
  const topAttackContributors=[...(players||[])]
    .filter(p=>Number(p.attack_profile?.attack_contribution_share||0)>0)
    .sort((a,b)=>Number(b.attack_profile?.attack_contribution_share||0)-Number(a.attack_profile?.attack_contribution_share||0))
    .slice(0,5)
  const topPicks=sortedPlayers.slice(0,3)
  const fantasyTotal=fantasyWeeks.reduce((sum,[,pts])=>sum+Number(pts||0),0)
  const recentFantasyWeeks=fantasyWeeks.slice(-3)
  const recentFantasyAvg=recentFantasyWeeks.length
    ? recentFantasyWeeks.reduce((sum,[,pts])=>sum+Number(pts||0),0)/recentFantasyWeeks.length
    : 0
  const lastFantasyWeek=fantasyWeeks.at(-1)
  const bestFantasyWeek=fantasyWeeks.length
    ? Math.max(...fantasyWeeks.map(([,pts])=>Number(pts||0)))
    : 0

  return <div className="team-detail-page team-detail-v2" style={teamCssVars(team.name)}>
    <Link href="/teams" className="back-link">← Takım Analizi'ne dön</Link>

    <section className="card team-detail-hero team-detail-hero-v2">
      <div className="team-detail-mark">{team.short_name||team.name.slice(0,3).toUpperCase()}</div>
      <div className="team-detail-copy">
        <span className="eyebrow">TAKIM ANALİZİ</span>
        <h1>{team.name}</h1>
        <p>MH1–MH{s?.through_gameweek||'—'} • {players.length} aktif oyuncu</p>
        <div className="team-hero-pills">
          <span>{matchesPlayed} maç</span>
          <span>{num(s?.xg_per_match)} xG/maç</span>
          <span>{num(s?.xga_per_match)} xGA/maç</span>
          <span>{fantasyTotal} fantezi puanı</span>
        </div>
      </div>
      <div className="team-detail-current">
        <span>MH{run?.gameweek||'—'} {currentMatches.length>1?'rakipleri':'rakibi'}</span>
        {currentMatches.length?currentMatches.map(m=><div key={m.match_id}>
          {m.opponent?<Link href={'/teams/'+m.opponent.id}>{m.opponent.name}</Link>:<b>—</b>}
          <small>{m.venue==='HOME'?'Ev sahibi':'Deplasman'}</small>
        </div>):<b>—</b>}
      </div>
    </section>

    <section className="card profile-card team-week-decision">
      <div className="team-detail-section-head">
        <div>
          <span className="eyebrow">BU HAFTA</span>
          <h2>Fantezi karar özeti</h2>
        </div>
        <div className="team-fixture-list">
          {currentMatches.length?currentMatches.map(m=><div className="team-fixture-badge" key={m.match_id}>
            <span>{m.venue==='HOME'?'Ev sahibi':'Deplasman'}</span>
            {m.opponent?<Link href={'/teams/'+m.opponent.id}>{m.opponent.name}</Link>:<b>Rakip yok</b>}
          </div>):<div className="team-fixture-badge"><span>—</span><b>Rakip yok</b></div>}
        </div>
      </div>

      <div className="team-week-metrics">
        <div><span>Takım xG</span><b>{num(teamXg)}</b><small>gol üretim beklentisi</small></div>
        <div><span>Rakip xG</span><b>{num(oppXg)}</b><small>savunma riski</small></div>
        <div><span>Galibiyet</span><b>{pct(win)}</b><small>maç kazanma ihtimali</small></div>
        <div><span>Gol yememe</span><b>{pct(cs)}</b><small>savunma getirisi</small></div>
      </div>

      <div className="team-top-picks">
        <div className="team-top-picks-head"><span>ÖNE ÇIKANLAR</span><small>xFP'ye göre ilk 3</small></div>
        <div className="team-top-picks-grid">
          {topPicks.map((p,i)=><Link href={'/players/'+p.id} className="team-top-pick" key={p.id}>
            <span className={'pos '+p.position}>{posLabel(p.position)}</span>
            <div>
              <small>#{i+1}</small>
              <b>{playerLabel(p)}</b>
              <em>{Number(p.price||0).toFixed(1)}m</em>
            </div>
            <strong>{num(p.projection?.xfp)}<small>xFP</small></strong>
          </Link>)}
        </div>
      </div>
    </section>

    <section className="team-detail-stat-grid team-core-stat-grid">
      <div className="card"><span>Gol / maç</span><b>{num(goalsPerMatch)}</b><small>{s?.goals_for||0} gol</small></div>
      <div className="card"><span>xG / maç</span><b>{num(s?.xg_per_match)}</b><small>{num(s?.xg_total)} toplam</small></div>
      <div className="card"><span>Yenen / maç</span><b>{num(concededPerMatch)}</b><small>{s?.goals_against||0} gol</small></div>
      <div className="card"><span>xGA / maç</span><b>{num(s?.xga_per_match)}</b><small>{num(s?.xga_total)} toplam</small></div>
      <div className="card xg-diff-stat"><span>xG farkı / maç</span><b>{xgDiffPerMatch>0?'+':''}{num(xgDiffPerMatch)}</b><small>toplam {Number(s?.xg_diff||0)>0?'+':''}{num(s?.xg_diff)}</small></div>
    </section>

    {isPro?<section className="card profile-card team-tactical-profile">
      <div className="panel-head">
        <div><span className="eyebrow">GÜÇLÜ / ZAYIF YANLAR</span><h2>Atak ve savunma profili</h2></div>
        <small>{hasAdvancedProfile?`Detay profil MH${tactical.advanced_profile_through_gameweek} • ${tactical.advanced_profile_matches} maç`:tacticalCoverage==='event_complete'?'Detay olay verisi tam':'Genel hücum/savunma profili'}</small>
      </div>
      <div className="team-detail-stat-grid team-core-stat-grid">
        <div className="card"><span>Hücum gücü</span><b>{idx(tactical?.attack_strength_index)}</b><small>lig ortalaması = 1.00</small></div>
        <div className="card"><span>Savunma gücü</span><b>{idx(tactical?.defense_strength_index)}</b><small>yüksek değer daha iyi</small></div>
        <div className="card"><span>Şut hacmi</span><b>{idx(tactical?.shot_volume_index)}</b><small>lig ortalaması = 1.00</small></div>
        <div className="card"><span>Rakip isabetli şut baskısı</span><b>{idx(tactical?.keeper_pressure_index)}</b><small>yüksek değer daha fazla baskı</small></div>
        <div className="card"><span>İsabetli şut / maç</span><b>{num(tactical?.shots_on_target_per_match,1)}</b><small>hücum baskısı</small></div>
        <div className="card"><span>Büyük şans</span><b>{tactical?.big_chances??'—'}</b><small>kaçan: {tactical?.big_chances_missed??'—'}</small></div>
        <div className="card"><span>Rakip ceza sahası dokunuşu</span><b>{tactical?.touches_in_opposition_box??'—'}</b><small>sezon toplamı</small></div>
        <div className="card"><span>Şut dönüşümü</span><b>{tactical?.shot_conversion_rate===null||tactical?.shot_conversion_rate===undefined?'—':Number(tactical.shot_conversion_rate).toFixed(1)+'%'}</b><small>gol / şut</small></div>
      </div>
      {hasAdvancedProfile?<div className="team-detail-stat-grid team-core-stat-grid">
        <div className="card"><span>Ceza sahası dokunuşu / maç</span><b>{num(tactical?.touches_in_box_per_match,1)}</b><small>rakip ceza sahası baskısı</small></div>
        <div className="card"><span>Şut isabeti</span><b>{pctShare(tactical?.shot_accuracy)}</b><small>isabetli şut / toplam şut</small></div>
        <div className="card"><span>Duran top xG payı</span><b>{pctShare(tactical?.set_piece_xg_share)}</b><small>{num(tactical?.set_piece_xg_per_match,2)} xG/maç</small></div>
        <div className="card"><span>Rakip duran top xG payı</span><b>{pctShare(tactical?.opponent_set_piece_xg_share)}</b><small>{num(tactical?.opponent_set_piece_xg_per_match,2)} xGA/maç</small></div>
        <div className="card"><span>Orta / maç</span><b>{num(tactical?.crosses_per_match,1)}</b><small>başarı {pctShare(tactical?.cross_success_rate)}</small></div>
        <div className="card"><span>Çalım / maç</span><b>{num(tactical?.takeons_per_match,1)}</b><small>başarı {pctShare(tactical?.takeon_success_rate)}</small></div>
        <div className="card"><span>Üretilen şans / maç</span><b>{num(tactical?.chances_created_per_match,1)}</b><small>oyuncu aksiyon toplamı</small></div>
        <div className="card"><span>PPDA</span><b>{num(tactical?.ppda_avg,1)}</b><small>düşük değer daha agresif baskı</small></div>
      </div>:null}
      {hasInferredChannels?<div className="profile-grid team-detail-history-grid">
        <div className="card">
          <h3>Hücum yönü <small>türetilmiş</small></h3>
          <div className="detail-list">
            <div><span>Sol kanal</span><b>{pctShare(tactical?.inferred_attack_left_share)}</b></div>
            <div><span>Merkez</span><b>{pctShare(tactical?.inferred_attack_center_share)}</b></div>
            <div><span>Sağ kanal</span><b>{pctShare(tactical?.inferred_attack_right_share)}</b></div>
          </div>
          <small className="muted">Oyuncuların gerçek saha rolü + şut + yaratılan şans + başarılı orta aksiyonlarından türetildi.</small>
        </div>
        <div className="card">
          <h3>Rakibin bize karşı hücum yönü <small>türetilmiş</small></h3>
          <div className="detail-list">
            <div><span>Sol kanal</span><b>{pctShare(tactical?.inferred_conceded_left_share)}</b></div>
            <div><span>Merkez</span><b>{pctShare(tactical?.inferred_conceded_center_share)}</b></div>
            <div><span>Sağ kanal</span><b>{pctShare(tactical?.inferred_conceded_right_share)}</b></div>
            <div><span>Rakip şut / maç</span><b>{num(tactical?.opponent_shots_per_match,1)}</b></div>
            <div><span>Rakip ceza sahası dokunuşu / maç</span><b>{num(tactical?.opponent_touches_in_box_per_match,1)}</b></div>
          </div>
          <small className="muted">Bu bölüm golün gerçek başlangıç koordinatı değil; rakip aksiyonlarının rol-kanal dağılımıdır.</small>
        </div>
      </div>:null}

      <div className="profile-grid team-detail-history-grid">
        <div className="card">
          <h3>Duran top üretimi</h3>
          <div className="detail-list">
            <div><span>Duran top golü</span><b>{tactical?.set_piece_goals??'—'}</b></div>
            <div><span>Duran top xG</span><b>{num(tactical?.set_piece_xg,1)}</b></div>
            <div><span>Duran toptan yenilen</span><b>{tactical?.set_piece_goals_conceded??'—'}</b></div>
            <div><span>Duran top xGA</span><b>{num(tactical?.set_piece_xga,1)}</b></div>
            <div><span>Topa sahip olma</span><b>{tactical?.possession_percentage===null||tactical?.possession_percentage===undefined?'—':Number(tactical.possession_percentage).toFixed(1)+'%'}</b></div>
          </div>
        </div>
        <div className="card">
          <h3>Hücuma en çok katkı</h3>
          <div className="detail-list">
            {topAttackContributors.length?topAttackContributors.map(p=><div key={p.id}>
              <span><Link href={'/players/'+p.id}>{playerLabel(p)}</Link></span>
              <b>{pctShare(p.attack_profile?.attack_contribution_share)}</b>
            </div>):<div><span>Veri</span><b>—</b></div>}
          </div>
        </div>
      </div>
      {hasEventProfile?<div className="profile-grid team-detail-history-grid">
        <div className="card">
          <h3>Atak yönü</h3>
          <div className="detail-list">
            <div><span>Sol</span><b>{pctShare(tactical?.attack_left_share)}</b></div>
            <div><span>Merkez</span><b>{pctShare(tactical?.attack_center_share)}</b></div>
            <div><span>Sağ</span><b>{pctShare(tactical?.attack_right_share)}</b></div>
            <div><span>Ceza sahası içi goller</span><b>{pctShare(tactical?.goals_box_share)}</b></div>
            <div><span>Uzaktan goller</span><b>{pctShare(tactical?.goals_outside_box_share)}</b></div>
            <div><span>Duran top golleri</span><b>{pctShare(tactical?.goals_set_piece_share)}</b></div>
            <div><span>Kontra golleri</span><b>{pctShare(tactical?.goals_counter_share)}</b></div>
          </div>
        </div>
        <div className="card">
          <h3>Savunma zaafı</h3>
          <div className="detail-list">
            <div><span>Soldan yenen atak</span><b>{pctShare(tactical?.conceded_left_share)}</b></div>
            <div><span>Merkezden yenen atak</span><b>{pctShare(tactical?.conceded_center_share)}</b></div>
            <div><span>Sağdan yenen atak</span><b>{pctShare(tactical?.conceded_right_share)}</b></div>
            <div><span>Ceza sahası içi yenilen</span><b>{pctShare(tactical?.conceded_box_share)}</b></div>
            <div><span>Uzaktan yenilen</span><b>{pctShare(tactical?.conceded_outside_box_share)}</b></div>
            <div><span>Duran toptan yenilen</span><b>{pctShare(tactical?.conceded_set_piece_share)}</b></div>
            <div><span>Kontradan yenilen</span><b>{pctShare(tactical?.conceded_counter_share)}</b></div>
          </div>
        </div>
      </div>:<p className="muted">Gerçek gol/şut koordinatı, ceza sahası–uzak mesafe ve kontra kırılımları için olay-seviyesi kaynak henüz yok. Yukarıdaki yön profili gerçek saha rolleri ve aksiyonlardan türetilmiştir; gözlenen olay konumu gibi sunulmaz.</p>}
    </section>:<AccessGate
      compact
      tier="pro"
      eyebrow="GELİŞMİŞ • TAKIM DERİNLİĞİ"
      title="Gelişmiş hücum-savunma profilini aç."
      description="Hücum kanalları, rakibin saldırı yönü, duran top üretimi, baskı ve gelişmiş takım eşleşmeleri Gelişmiş üyelikte görünür."
    />}

    <section className="card team-roster-section team-roster-v2">
      <div className="panel-head team-roster-head">
        <div>
          <span className="eyebrow">OYUNCULAR</span>
          <h2>Fantezi oyuncu havuzu</h2>
        </div>
        <div className="team-roster-summary">
          <span><small>AKTİF</small><b>{players.length} oyuncu</b></span>
        </div>
      </div>
      <TeamRoster players={sortedPlayers}/>
    </section>

    <div className="profile-grid team-detail-history-grid">
      <section className="card team-history-section">
        <div className="panel-head">
          <div><span className="eyebrow">MAÇ GEÇMİŞİ</span><h2>Sezon sonuçları</h2></div>
          <span className="muted">{played.length} maç</span>
        </div>
        <div className="team-history-list">{played.map(m=>{
          const home=Number(m.home_team_id)===Number(team.id)
          const oppId=home?m.away_team_id:m.home_team_id
          const oppName=home?m.away_team_name:m.home_team_name
          const gf=home?m.home_goals:m.away_goals
          const ga=home?m.away_goals:m.home_goals
          const result=gf>ga?'G':gf===ga?'B':'M'
          return <div className="team-history-row" key={m.match_id}>
            <span>MH{m.gameweek}</span>
            <i className={'result '+result}>{result}</i>
            <b>{home?'Ev':'Dep'} • <Link href={'/teams/'+oppId}>{oppName}</Link></b>
            <strong>{gf} - {ga}</strong>
          </div>
        })}</div>
      </section>

      <section className="card team-fantasy-history team-fantasy-history-v2">
        <div className="panel-head">
          <div><span className="eyebrow">FANTEZİ FORMU</span><h2>Haftalık takım üretimi</h2></div>
        </div>
        <div className="team-fantasy-summary">
          <div><span>Son hafta</span><b>{lastFantasyWeek?Number(lastFantasyWeek[1]||0):'—'}</b></div>
          <div><span>Son 3 ort.</span><b>{recentFantasyWeeks.length?recentFantasyAvg.toFixed(1):'—'}</b></div>
          <div><span>En yüksek</span><b>{fantasyWeeks.length?bestFantasyWeek:'—'}</b></div>
          <div><span>Toplam</span><b>{fantasyTotal}</b></div>
        </div>
        <div className="team-week-points">
          {fantasyWeeks.map(([gw,pts])=><div key={gw}><span>MH{gw}</span><b>{pts}</b></div>)}
        </div>
      </section>
    </div>

    {isPro?<details className="card profile-card team-advanced-details">
      <summary>
        <span><small>İLERİ TAKIM İSTATİSTİKLERİ</small><b>Teknik sezon profilini göster</b></span>
        <i>+</i>
      </summary>
      <div className="team-advanced-body">
        <div className="team-advanced-group">
          <div className="team-profile-group-head"><span>HÜCUM</span><b>{s?.goals_for||0} gol</b></div>
          <div className="detail-list">
            <div><span>Toplam xG</span><b>{num(s?.xg_total)}</b></div>
            <div><span>Şut / maç</span><b>{num(shotsPerMatch,1)}</b></div>
            <div><span>Gol − xG</span><b>{finishingDelta>0?'+':''}{num(finishingDelta)}</b></div>
          </div>
        </div>
        <div className="team-advanced-group">
          <div className="team-profile-group-head"><span>SAVUNMA & BASKI</span><b>{s?.goals_against||0} gol yedi</b></div>
          <div className="detail-list">
            <div><span>Toplam xGA</span><b>{num(s?.xga_total)}</b></div>
            <div><span>Rakip isabetli şut / maç</span><b>{num(oppSotPerMatch,1)}</b></div>
            <div><span>xGA − yenen gol</span><b>{defensiveDelta>0?'+':''}{num(defensiveDelta)}</b></div>
            <div><span>PPDA</span><b>{num(s?.ppda)}</b></div>
          </div>
        </div>
        {s?.coverage_note?<small className="team-profile-coverage">{s.coverage_note}</small>:null}
      </div>
    </details>:null}
  </div>
}
