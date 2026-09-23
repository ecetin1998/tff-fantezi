import Link from 'next/link'
import { getRecommendation } from '@/lib/data'
import { teamCssVars } from '@/lib/teamThemes'

export const revalidate=300

function Squad({title,data,variant}){
  const xi=data.members.filter(m=>m.squad_slot==='XI')
  const bench=data.members.filter(m=>m.squad_slot!=='XI')
  const groups=['GK','DEF','MID','FWD']
  const formation=`${xi.filter(m=>m.player?.position==='DEF').length}-${xi.filter(m=>m.player?.position==='MID').length}-${xi.filter(m=>m.player?.position==='FWD').length}`

  return <section className={`card squad-card pitch-squad-card ${variant}`}>
    <div className="panel-head squad-head">
      <div><span className="eyebrow">{title}</span><h2>{formation}</h2></div>
      <div className="budget"><b>{Number(data.recommendation?.budget||0).toFixed(1)}m</b><span>{Number(data.recommendation?.xi_xfp||0).toFixed(2)} XI xFP</span></div>
    </div>

    <div className="fantasy-pitch">
      <div className="pitch-center-circle"/>
      {groups.map(pos=><div className={`pitch-row pitch-${pos}`} key={pos}>
        {xi.filter(m=>m.player?.position===pos).map(m=>
          <Link className="pitch-player club-pitch-player" style={teamCssVars(m.team)} href={'/players/'+m.player_id} key={m.player_id}>
            <span className={`shirt-dot ${pos}`} style={teamCssVars(m.team)}>{pos}</span>
            <b>{m.player?.full_name}</b>
            <small>{m.team}</small>
            <strong>{Number(m.xfp||0).toFixed(1)} xFP</strong>
            {m.is_captain?<em>C</em>:null}
          </Link>
        )}
      </div>)}
    </div>

    <div className="bench bench-cards">
      <div className="bench-title"><span className="eyebrow">YEDEK KULÜBESİ</span><small>15 kişilik kadro</small></div>
      <div className="bench-card-row">{bench.map(m=>
        <Link href={'/players/'+m.player_id} className="bench-card team-accent-card" style={teamCssVars(m.team)} key={m.player_id}>
          <span className={`pos ${m.player?.position}`}>{m.player?.position}</span>
          <b>{m.player?.full_name}</b>
          <small>{Number(m.player?.price||0).toFixed(1)}m • {Number(m.xfp||0).toFixed(1)} xFP</small>
        </Link>
      )}</div>
    </div>
  </section>
}

export default async function Squads(){
  const [rec,alt]=await Promise.all([getRecommendation('recommended'),getRecommendation('alternative')])
  return <>
    <div className="section-title">
      <div><span className="eyebrow">KADRO OPTİMİZASYONU</span><h1>GW{rec.run?.gameweek||'—'} Kadroları</h1></div>
      <span className="muted">Saha görünümü • XI • yedek • kaptan</span>
    </div>
    <div className="squad-tabs-note"><span>● Önerilen: dengeli maksimum beklenen puan</span><span>◇ Alternatif: farklı oyuncularla ceiling senaryosu</span></div>
    <div className="squad-comparison-grid">
      <Squad title="ÖNERİLEN KADRO" data={rec} variant="recommended"/>
      <Squad title="ALTERNATİF KADRO" data={alt} variant="alternative"/>
    </div>
  </>
}
