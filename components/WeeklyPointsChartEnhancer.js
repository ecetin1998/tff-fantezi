'use client'

import {useEffect} from 'react'

const NS='http://www.w3.org/2000/svg'
const make=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el}

function draw(root){
  let rows=[]
  try{rows=JSON.parse(root.dataset.weeklyPoints||'[]')}catch{return}
  if(!rows.length)return
  root.innerHTML=''
  const width=960,height=260,pad={l:42,r:18,t:22,b:38}
  const vals=rows.map(r=>Number(r.points||0))
  const min=Math.min(0,...vals),max=Math.max(6,...vals)
  const span=Math.max(1,max-min)
  const x=i=>pad.l+(width-pad.l-pad.r)*(rows.length===1?.5:i/(rows.length-1))
  const y=v=>pad.t+(height-pad.t-pad.b)*(1-(Number(v)-min)/span)
  const svg=make('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Haftalık fantezi puanları grafiği'})
  const grid=make('g',{class:'weekly-points-grid'})
  const ticks=4
  for(let i=0;i<=ticks;i++){
    const val=min+span*i/ticks, yy=y(val)
    grid.append(make('line',{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy}))
    const label=make('text',{x:pad.l-9,y:yy+4,'text-anchor':'end'});label.textContent=val.toFixed(0);grid.append(label)
  }
  svg.append(grid)
  if(min<0&&max>0)svg.append(make('line',{class:'weekly-zero-line',x1:pad.l,x2:width-pad.r,y1:y(0),y2:y(0)}))
  const path=make('path',{class:'weekly-points-line',d:rows.map((r,i)=>`${i?'L':'M'} ${x(i)} ${y(r.points)}`).join(' ')})
  svg.append(path)
  rows.forEach((r,i)=>{
    const g=make('g',{class:'weekly-point'})
    const dot=make('circle',{cx:x(i),cy:y(r.points),r:5,tabindex:0})
    const title=make('title');title.textContent=`MH${r.gameweek}: ${r.points} puan${r.minutes===null?'':` • ${Math.round(r.minutes)} dk`}`;dot.append(title);g.append(dot)
    const val=make('text',{class:'weekly-point-value',x:x(i),y:y(r.points)-11,'text-anchor':'middle'});val.textContent=String(r.points);g.append(val)
    const step=rows.length>20?4:rows.length>12?2:1
    if(i%step===0||i===rows.length-1){const lab=make('text',{class:'weekly-week-label',x:x(i),y:height-13,'text-anchor':'middle'});lab.textContent='MH'+r.gameweek;g.append(lab)}
    svg.append(g)
  })
  root.append(svg)
}
export default function WeeklyPointsChartEnhancer(){
  useEffect(()=>{document.querySelectorAll('.weekly-points-chart').forEach(draw)},[])
  return <style>{`
    .weekly-points-chart{width:100%;margin-top:14px;overflow:hidden}
    .weekly-points-chart svg{display:block;width:100%;height:auto;min-height:210px;overflow:visible}
    .weekly-points-grid line{stroke:rgba(148,163,184,.16);stroke-width:1}
    .weekly-points-grid text,.weekly-week-label{fill:var(--muted,#94a3b8);font-size:11px;font-weight:700}
    .weekly-zero-line{stroke:rgba(148,163,184,.35);stroke-dasharray:5 5}
    .weekly-points-line{fill:none;stroke:var(--team-primary,#7c3aed);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
    .weekly-point circle{fill:var(--surface,#0f172a);stroke:var(--team-primary,#7c3aed);stroke-width:3;outline:none}
    .weekly-point circle:focus{stroke-width:5}
    .weekly-point-value{fill:var(--text,#f8fafc);font-size:11px;font-weight:800}
    .weekly-points-chart-fallback{display:flex;gap:8px;flex-wrap:wrap}
    @media(max-width:620px){.weekly-points-chart svg{min-height:180px}.weekly-point-value{font-size:10px}.weekly-points-grid text,.weekly-week-label{font-size:9px}}
  `}</style>
}
