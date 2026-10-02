'use client'

import {useEffect} from 'react'

const NS='http://www.w3.org/2000/svg'
const make=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el}

function draw(root){
  let rows=[]
  try{rows=JSON.parse(root.dataset.weeklyPoints||'[]')}catch{return}
  if(!rows.length)return
  root.innerHTML=''
  const width=960,height=300,pad={l:48,r:20,t:30,b:42}
  const vals=rows.map(r=>Number(r.points||0))
  const rawMin=Math.min(0,...vals),rawMax=Math.max(6,...vals)
  const extra=Math.max(2,(rawMax-rawMin)*.12)
  const min=Math.floor(rawMin-extra),max=Math.ceil(rawMax+extra)
  const span=Math.max(1,max-min)
  const plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b
  const slot=plotW/Math.max(rows.length,8)
  const x=i=>pad.l+slot*(i+.5)
  const y=v=>pad.t+plotH*(1-(Number(v)-min)/span)
  const zeroY=y(0)
  const svg=make('svg',{viewBox:`0 0 ${width} ${height}`,preserveAspectRatio:'xMidYMid meet',role:'img','aria-label':'Haftalık fantezi puanları grafiği'})
  const grid=make('g',{class:'weekly-points-grid'})
  for(let i=0;i<=4;i++){
    const val=min+span*i/4,yy=y(val)
    grid.append(make('line',{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy}))
    const label=make('text',{x:pad.l-10,y:yy+4,'text-anchor':'end'});label.textContent=Math.round(val);grid.append(label)
  }
  svg.append(grid)
  svg.append(make('line',{class:'weekly-zero-line',x1:pad.l,x2:width-pad.r,y1:zeroY,y2:zeroY}))
  rows.forEach((r,i)=>{
    const value=Number(r.points||0),yy=y(value)
    const barW=Math.min(58,slot*.58),barY=Math.min(yy,zeroY),barH=Math.max(3,Math.abs(zeroY-yy))
    const g=make('g',{class:'weekly-point'})
    const bar=make('rect',{class:value<0?'weekly-score-bar negative':'weekly-score-bar',x:x(i)-barW/2,y:barY,width:barW,height:barH,rx:8,tabindex:0})
    const title=make('title');title.textContent=`MH${r.gameweek}: ${value} puan${r.minutes===null?'':` • ${Math.round(r.minutes)} dk`}`;bar.append(title);g.append(bar)
    const valueLabel=make('text',{class:'weekly-point-value',x:x(i),y:value>=0?barY-9:barY+barH+17,'text-anchor':'middle'});valueLabel.textContent=String(value);g.append(valueLabel)
    const week=make('text',{class:'weekly-week-label',x:x(i),y:height-14,'text-anchor':'middle'});week.textContent='MH'+r.gameweek;g.append(week)
    svg.append(g)
  })
  root.append(svg)
}

export default function WeeklyPointsChartEnhancer(){
  useEffect(()=>{document.querySelectorAll('.weekly-points-chart').forEach(draw)},[])
  return <style>{`
    .weekly-points-chart{width:100%;margin-top:14px;overflow:hidden;border-radius:16px;background:rgba(15,23,42,.025);padding:8px 4px 0}
    .weekly-points-chart svg{display:block;width:100%;height:auto;aspect-ratio:960/300}
    .weekly-points-grid line{stroke:rgba(100,116,139,.18);stroke-width:1}
    .weekly-points-grid text,.weekly-week-label{fill:#64748b;font-size:12px;font-weight:750}
    .weekly-zero-line{stroke:rgba(71,85,105,.42);stroke-width:1.5}
    .weekly-score-bar{fill:#16a34a;opacity:.88;outline:none}
    .weekly-score-bar.negative{fill:#dc2626}
    .weekly-score-bar:hover,.weekly-score-bar:focus{opacity:1;stroke:rgba(15,23,42,.35);stroke-width:2}
    .weekly-point-value{fill:#0f172a;font-size:13px;font-weight:850}
    .weekly-points-chart-fallback{display:flex;gap:8px;flex-wrap:wrap}
    @media(prefers-color-scheme:dark){.weekly-points-chart{background:rgba(255,255,255,.025)}.weekly-points-grid text,.weekly-week-label{fill:#94a3b8}.weekly-point-value{fill:#f8fafc}}
    @media(max-width:620px){.weekly-points-chart{overflow-x:auto;overscroll-behavior-inline:contain}.weekly-points-chart svg{width:max(700px,100%);height:auto;aspect-ratio:960/300}}
  `}</style>
}
