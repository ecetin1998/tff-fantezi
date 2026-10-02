'use client'
import {useId,useMemo,useState} from 'react'

export default function WeeklyPointsChart({rows=[]}){
  const [hover,setHover]=useState(null)
  const gid=useId().replace(/:/g,'')
  const data=useMemo(()=>[...rows].sort((a,b)=>a.gameweek-b.gameweek),[rows])
  if(!data.length)return null
  const W=640,H=260,p={l:40,r:14,t:30,b:38}
  const values=data.map(x=>Number(x.points||0)),lo=Math.min(0,...values),hi=Math.max(6,...values)
  const extra=Math.max(2,(hi-lo)*.12),min=Math.floor(lo-extra),max=Math.ceil(hi+extra),span=Math.max(1,max-min)
  const x=i=>p.l+(W-p.l-p.r)*(data.length===1?.5:i/(data.length-1))
  const y=v=>p.t+(H-p.t-p.b)*(1-(Number(v)-min)/span)
  const d=data.map((r,i)=>`${i?'L':'M'} ${x(i)} ${y(r.points)}`).join(' ')
  return <div className="weekly-points-react-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Haftalık fantezi puanları çizgi grafiği">
      <defs><linearGradient id={'area-'+gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {[0,1,2,3,4].map(i=>{const v=min+span*i/4,yy=y(v);return <g className="weekly-grid" key={i}><line x1={p.l} x2={W-p.r} y1={yy} y2={yy}/><text x={p.l-9} y={yy+4} textAnchor="end">{Math.round(v)}</text></g>})}
      <path className="weekly-area" d={d+` L ${x(data.length-1)} ${y(min)} L ${x(0)} ${y(min)} Z`} fill={'url(#area-'+gid+')'}/>
      <path className="weekly-line" d={d}/>
      {data.map((r,i)=><g key={r.gameweek} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)}>
        <circle className="weekly-dot-hit" cx={x(i)} cy={y(r.points)} r="16" tabIndex="0"/>
        <circle className="weekly-dot" cx={x(i)} cy={y(r.points)} r="5"/>
        <text className="weekly-value" x={x(i)} y={y(r.points)-13} textAnchor="middle">{r.points}</text>
        <text className="weekly-x-label" x={x(i)} y={H-13} textAnchor="middle">MH{r.gameweek}</text>
        {hover===i?<g className="weekly-tooltip"><rect x={Math.min(W-176,Math.max(8,x(i)-80))} y={Math.max(8,y(r.points)-70)} width="160" height="42" rx="10"/><text x={Math.min(W-96,Math.max(88,x(i)))} y={Math.max(33,y(r.points)-45)} textAnchor="middle">MH{r.gameweek} • {r.points} puan{r.minutes==null?'':` • ${Math.round(r.minutes)} dk`}</text></g>:null}
      </g>)}
    </svg>
    <style jsx>{`
      .weekly-points-react-chart{width:100%;margin-top:14px;overflow:hidden;color:#16a34a}
      svg{display:block;width:100%;height:auto;aspect-ratio:960/280}
      .weekly-grid line{stroke:rgba(100,116,139,.17);stroke-width:1}.weekly-grid text,.weekly-x-label{fill:#64748b;font-size:11px;font-weight:700}
      .weekly-area{color:#16a34a}.weekly-line{fill:none;stroke:#16a34a;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
      .weekly-dot{fill:#fff;stroke:#16a34a;stroke-width:4;pointer-events:none}.weekly-dot-hit{fill:transparent;outline:none;cursor:pointer}
      .weekly-value{fill:#0f172a;font-size:12px;font-weight:850;pointer-events:none}.weekly-tooltip rect{fill:#0f172a;opacity:.94}.weekly-tooltip text{fill:#fff;font-size:11px;font-weight:750}
      @media(max-width:620px){.weekly-points-react-chart{overflow:hidden;margin-top:10px}.weekly-points-react-chart svg{width:100%;max-width:100%;height:auto;aspect-ratio:640/260}.weekly-grid text,.weekly-x-label{font-size:12px}.weekly-value{font-size:13px}.weekly-line{stroke-width:3}}
    `}</style>
  </div>
}
