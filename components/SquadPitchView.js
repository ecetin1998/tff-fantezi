import Link from 'next/link'
import { teamCssVars } from '@/lib/teamThemes'

const posLabel={GK:'KL',DEF:'DEF',MID:'OS',FWD:'FOR'}

function fallbackName(name=''){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean)
  return parts.at(-1)||'—'
}
function displayName(player){
  return player?.display_name || fallbackName(player?.full_name)
}
function shirtMark(player,team=''){
  return player?.shirt_number ?? String(team||'').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g,'').slice(0,3).toLocaleUpperCase('tr')
}

export default function SquadPitchView({
  members=[],
  title='Kadro',
  gameweek,
  budget,
  xiXfp,
  actionHref,
  actionLabel='Detay →',
  compact=false,
  showBench=true,
  variant='recommended',
}){
  const xi=members.filter(m=>m.squad_slot==='XI')
  const bench=members.filter(m=>m.squad_slot!=='XI').sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0))
  const groups=['GK','DEF','MID','FWD']
  const formation=`${xi.filter(m=>m.player?.position==='DEF').length}-${xi.filter(m=>m.player?.position==='MID').length}-${xi.filter(m=>m.player?.position==='FWD').length}`

  return <section className={`readonly-squad-view ${compact?'compact':''} ${variant}`}>
    <div className="readonly-squad-head">
      <div>
        <span className="eyebrow">{title}</span>
        <h2>{gameweek?`GW${gameweek} • `:''}{formation}</h2>
      </div>
      <div className="readonly-squad-head-right">
        {budget!==undefined&&budget!==null?<span><small>Bütçe</small><b>{Number(budget).toFixed(1)}m</b></span>:null}
        {xiXfp!==undefined&&xiXfp!==null?<span><small>İlk 11 xFP</small><b>{Number(xiXfp).toFixed(2)}</b></span>:null}
        {actionHref?<Link className="pill" href={actionHref}>{actionLabel}</Link>:null}
      </div>
    </div>

    <div className={`my-squad-pitch readonly-squad-pitch ${compact?'compact':''}`}>
      <div className="formation-live-badge"><span>TAKTİK</span><b>{formation}</b></div>
      <div className="pitch-mark center-line"/>
      <div className="pitch-mark center-circle"/>
      <div className="pitch-mark box top"/>
      <div className="pitch-mark box bottom"/>

      {groups.map(position=><div className={`my-pitch-row row-${position}`} key={position}>
        {xi.filter(m=>m.player?.position===position).map(m=><Link
          href={'/players/'+m.player_id}
          className="readonly-pitch-player"
          key={m.player_id}
          title={m.player?.full_name||''}
        >
          <span className={`fantasy-shirt ${m.player?.position}`} style={teamCssVars(m.team)}><i>{m.player?.position||'—'}</i></span>
          <b>{displayName(m.player)}</b>
          <small>{m.team}</small>
          <div className="pitch-player-tags">
            <span>{Number(m.player?.price||0).toFixed(1)}m</span>
            <strong>{Number(m.xfp||0).toFixed(1)} xFP</strong>
          </div>
          {m.is_captain?<em className="readonly-captain">C</em>:null}
        </Link>)}
      </div>)}
    </div>

    {showBench?<div className="bench-zone readonly-bench-zone">
      <div className="bench-zone-head">
        <div><span className="eyebrow">YEDEKLER</span><b>{bench.length}/4</b></div>
        <span>15 kişilik kadro</span>
      </div>
      <div className="my-bench-row readonly-bench-row">
        {bench.map((m,i)=><Link href={'/players/'+m.player_id} className="my-bench-player readonly-bench-player" key={m.player_id}>
          <span className="bench-order">{i+1}</span>
          <span className={`fantasy-shirt mini ${m.player?.position}`} style={teamCssVars(m.team)}><i>{m.player?.position||'—'}</i></span>
          <span className="bench-copy"><b>{m.player?.full_name||'—'}</b><small>{posLabel[m.player?.position]||m.player?.position} • {Number(m.player?.price||0).toFixed(1)}m • {Number(m.xfp||0).toFixed(1)} xFP</small></span>
        </Link>)}
      </div>
    </div>:null}
  </section>
}
