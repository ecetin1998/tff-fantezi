'use client'

import {useEffect} from 'react'

const SVG_NS='http://www.w3.org/2000/svg'
const numberFrom=(text,label)=>{
  const match=String(text||'').match(new RegExp(label+'\\s*(-?\\d+(?:[.,]\\d+)?)','i'))
  return match?Number(match[1].replace(',','.')):null
}
const svgEl=(name,attrs={})=>{
  const node=document.createElementNS(SVG_NS,name)
  Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)))
  return node
}
const htmlEl=(name,styles={})=>{
  const node=document.createElement(name)
  Object.assign(node.style,styles)
  return node
}

function collectRows(list){
  return [...list.querySelectorAll('.compact-range-row')].map(row=>{
    const gameweek=Number((row.querySelector('.prediction-week')?.textContent||'').replace(/\D/g,''))
    const low=numberFrom(row.querySelector('.range-p25')?.textContent,'P25')
    const high=numberFrom(row.querySelector('.range-p90')?.textContent,'P90')
    const actual=numberFrom(row.querySelector('.range-actual-label')?.textContent,'Gerçek')
    const xfp=numberFrom(row.querySelector('.prediction-range-visual small')?.textContent,'Merkez xFP')
    return {gameweek,low,high,actual,xfp}
  }).filter(row=>row.gameweek&&[row.low,row.high,row.actual].every(Number.isFinite))
}

function renderChart(host,rows){
  const width=Math.max(320,Math.floor(host.getBoundingClientRect().width||320))
  const height=width<560?300:350
  const pad={left:width<560?38:48,right:12,top:24,bottom:42}
  const innerW=width-pad.left-pad.right
  const innerH=height-pad.top-pad.bottom
  const maxValue=Math.max(5,...rows.flatMap(row=>[row.high,row.actual,row.xfp].filter(Number.isFinite)))
  const yMax=Math.ceil((maxValue+1)/5)*5
  const x=gw=>pad.left+((gw-1)/33)*innerW
  const y=value=>pad.top+innerH-(Math.max(0,value)/yMax)*innerH

  host.innerHTML=''
  const legend=htmlEl('div',{display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap',margin:'0 0 10px',fontSize:'12px',color:'var(--muted, #64748b)'})
  legend.innerHTML='<span><i style="display:inline-block;width:18px;height:8px;border-radius:4px;background:rgba(59,130,246,.22);border:1px solid rgba(59,130,246,.48);margin-right:6px"></i>P25–P90 tahmin aralığı</span><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px"></i>Gerçek puan</span><span><i style="display:inline-block;width:18px;height:2px;background:#64748b;margin:0 6px 3px 0"></i>Merkez xFP</span>'
  host.appendChild(legend)

  const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,width:'100%',height:String(height),role:'img','aria-label':'Maç haftalarına göre P25–P90 tahmin aralığı ve gerçekleşen fantezi puanı'})
  svg.style.display='block'
  svg.style.overflow='visible'

  for(let tick=0;tick<=yMax;tick+=5){
    const yy=y(tick)
    svg.appendChild(svgEl('line',{x1:pad.left,y1:yy,x2:width-pad.right,y2:yy,stroke:'currentColor','stroke-opacity':'.10','stroke-width':'1'}))
    const label=svgEl('text',{x:pad.left-8,y:yy+4,'text-anchor':'end',fill:'currentColor','fill-opacity':'.58','font-size':'11'})
    label.textContent=String(tick)
    svg.appendChild(label)
  }

  const axisTitle=svgEl('text',{x:8,y:14,fill:'currentColor','fill-opacity':'.58','font-size':'11','font-weight':'600'})
  axisTitle.textContent='Puan'
  svg.appendChild(axisTitle)

  const labelEvery=width<560?5:2
  for(let gw=1;gw<=34;gw++){
    if(gw!==1&&gw!==34&&gw%labelEvery!==0)continue
    const label=svgEl('text',{x:x(gw),y:height-13,'text-anchor':'middle',fill:'currentColor','fill-opacity':'.58','font-size':'10'})
    label.textContent='MH'+gw
    svg.appendChild(label)
  }

  const xfpRows=rows.filter(row=>Number.isFinite(row.xfp)).sort((a,b)=>a.gameweek-b.gameweek)
  if(xfpRows.length>1){
    const path=xfpRows.map((row,index)=>`${index?'L':'M'} ${x(row.gameweek).toFixed(1)} ${y(row.xfp).toFixed(1)}`).join(' ')
    svg.appendChild(svgEl('path',{d:path,fill:'none',stroke:'#64748b','stroke-opacity':'.72','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round'}))
  }

  rows.forEach(row=>{
    const xx=x(row.gameweek)
    const top=y(row.high)
    const bottom=y(row.low)
    const band=svgEl('rect',{x:xx-4,y:top,width:'8',height:Math.max(3,bottom-top),rx:'4',fill:'#3b82f6','fill-opacity':'.22',stroke:'#3b82f6','stroke-opacity':'.48','stroke-width':'1'})
    const bandTitle=svgEl('title')
    bandTitle.textContent=`MH${row.gameweek} • P25 ${row.low.toFixed(1)} – P90 ${row.high.toFixed(1)}`
    band.appendChild(bandTitle)
    svg.appendChild(band)

    if(Number.isFinite(row.xfp))svg.appendChild(svgEl('circle',{cx:xx,cy:y(row.xfp),r:'2.2',fill:'#64748b'}))
    const actual=svgEl('circle',{cx:xx,cy:y(row.actual),r:width<560?'4':'4.5',fill:'#10b981',stroke:'var(--card, #fff)','stroke-width':'2'})
    const actualTitle=svgEl('title')
    actualTitle.textContent=`MH${row.gameweek} • Gerçek ${row.actual.toFixed(0)} • P25 ${row.low.toFixed(1)} • P90 ${row.high.toFixed(1)}${Number.isFinite(row.xfp)?` • xFP ${row.xfp.toFixed(1)}`:''}`
    actual.appendChild(actualTitle)
    svg.appendChild(actual)
  })

  host.appendChild(svg)
}

export default function PredictionHistoryChartEnhancer(){
  useEffect(()=>{
    let resizeObserver
    let mutationObserver
    let activeList
    let host
    let rows=[]

    const mount=()=>{
      const list=document.querySelector('.compact-range-history')
      if(!list||list.dataset.chartEnhanced==='true')return
      rows=collectRows(list)
      if(!rows.length)return
      activeList=list
      list.dataset.chartEnhanced='true'
      list.style.display='none'
      host=document.createElement('div')
      host.className='prediction-season-chart'
      host.style.width='100%'
      host.style.margin='8px 0 4px'
      list.insertAdjacentElement('afterend',host)
      renderChart(host,rows)
      resizeObserver=new ResizeObserver(()=>renderChart(host,rows))
      resizeObserver.observe(host)
    }

    mount()
    mutationObserver=new MutationObserver(mount)
    mutationObserver.observe(document.body,{childList:true,subtree:true})
    return ()=>{
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if(activeList){activeList.style.display='';delete activeList.dataset.chartEnhanced}
      host?.remove()
    }
  },[])
  return null
}
