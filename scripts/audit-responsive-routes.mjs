/* Browser layout audit for the Sky Blue release.
 * Public routes + responsive widths: horizontal overflow, clipping candidates
 * and player picker card collisions. Runs in a GitHub-hosted Chromium browser.
 * Logged-in-only sections require a separate authenticated visual QA run.
 */
// The dedicated audit workflow installs Playwright after the normal CI lint stage.
// eslint-disable-next-line import/no-unresolved
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'

const PORT=3131
const BASE='http://127.0.0.1:'+PORT
const routes=[
  '/', '/players','/matches','/squads','/squad','/points','/teams',
  '/roles','/availability','/draft','/sss','/pricing','/login','/signup',
  '/profile','/forgot-password','/backtest','/model-health'
]
const critical=['/','/players','/matches','/squads','/squad']
const viewports=[320,360,390,430,768,1280]
const out='artifacts/responsive-audit'
await mkdir(out,{recursive:true})

let logs=''
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(PORT)],{
  env:{
    ...process.env,
    SCOUT_OFFLINE_BUILD:'1',
    SCOUT_RUNTIME_FIXTURE:'1',
    SCOUT_DATA_API_KEY:process.env.SCOUT_DATA_API_KEY||'runtime-test-key-12345678901234567890'
  },
  stdio:['ignore','pipe','pipe']
})
server.stdout.on('data',b=>{logs+=b.toString().slice(0,2500)})
server.stderr.on('data',b=>{logs+=b.toString().slice(0,2500)})
async function startReady(){
  for(let i=0;i<80;i++){
    if(server.exitCode!==null)throw new Error('Server terminated: '+logs.slice(-2500))
    try{
      const r=await fetch(BASE+'/api/scout-data?section=summary',{signal:AbortSignal.timeout(1500)})
      if(r.ok)return
    }catch{}
    await new Promise(r=>setTimeout(r,500))
  }
  throw new Error('Server never became ready: '+logs.slice(-3000))
}
const all=[]
let browser
try{
  await startReady()
  browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  for(const width of viewports){
    const requested=width===390?routes:critical
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:width<=390,hasTouch:width<=390})
    for(const path of requested){
      const page=await context.newPage()
      const record={width,path,status:null,overflow:0,suspectCount:0,suspects:[],pickerCount:0,pickerCollisions:[],playerCardCount:0,playerCardCollisions:[],error:null}
      try{
        const response=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:12000})
        record.status=response?.status()||null
        await page.waitForTimeout(180)
        // The real squad picker is member-only. Render a synthetic fixture with
        // the exact production DOM classes and difficult long names if needed.
        // This tests actual CSS at each viewport without bypassing authentication.
        if(path==='/squad'){
          record.synthetic=await page.evaluate(()=>{
            if(document.querySelector('.picker-player-v3'))return false
            const host=document.createElement('section')
            host.className='my-squad-shell'
            host.setAttribute('data-audit-fixture','true')
            host.style.cssText='width:100%;margin:16px auto;padding:8px;max-width:860px'
            const names=[
              ['Mohamed Salah Hamed Mahrous Ghaly','Trabzonspor · OS · vs Eyüpspor (Ev)','12.0m','96 puan','8.05',true],
              ['Franco Daryl Tongya Heubang','Gençlerbirliği · OS · vs Gaziantep (Ev)','5.0m','45 puan','6.53',false],
              ['Abdülkerim Bardakcı','Galatasaray · DEF · vs Samsunspor (Ev) · 1 maç cezalı','5.5m','44 puan','0.00',false]
            ]
            const safe=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
            host.innerHTML='<aside class="player-picker"><div class="picker-table-head"><span class="picker-shirt-head"></span>'+['Oyuncu','Fiyat','xFP','Puan'].map(t=>'<button type="button">'+t+'</button>').join('')+'<span class="picker-action-head"></span></div><div class="picker-list">'+names.map(([name,meta,price,points,xfp,chosen])=>'<div class="picker-player picker-player-v3 '+(chosen?'chosen':'')+'"><div class="picker-player-content"><div class="picker-player-identity"><div class="picker-shirt-wrap"><span class="fantasy-shirt tiny OS"><i>OS</i></span></div><div class="picker-copy"><b>'+safe(name)+'</b><small class="squad-fixture-meta">'+safe(meta)+'</small></div></div><div class="picker-player-facts"><span class="picker-value price">'+safe(price)+'</span><span class="picker-fact-divider">•</span><span class="picker-value points">'+safe(points)+'</span></div></div><div class="picker-value xfp"><strong>'+safe(xfp)+'</strong><small>xFP</small></div><button class="'+(chosen?'picker-remove-player':'picker-add-player')+'" type="button">'+(chosen?'−':'+')+'</button></div>').join('')+'</div></aside>'
            document.querySelector('main')?.appendChild(host)
            return true
          })
        }
        // Test the exact production card classes with short and long names,
        // including the Pro metric layout, without requiring a Pro login.
        if(path==='/players'&&width<=768){
          await page.evaluate(()=>{
            const host=document.createElement('div')
            host.className='player-card-list'
            host.setAttribute('data-audit-player-cards','true')
            const names=['Eldor Shomurodov','Mohamed Salah Hamed Mahrous Ghaly']
            for(const name of names){
              const card=document.createElement('a')
              card.className='card mobile-player-card team-accent-card'
              card.innerHTML='<div class="mobile-player-top"><div class="mobile-card-badges"><span class="weekly-rank">#1</span><span class="pos MID">OS</span></div><div class="mobile-player-name"><b>'+name+'</b><span>Trabzonspor • OS • vs Göztepe (Dep)</span></div><div class="mobile-xfp"><strong>6.40</strong><small>xFP</small><em>99 toplam puan · 12.0m</em></div></div><div class="mobile-player-metrics">'+[['İlk 11','100%'],['xDakika','89'],['Tipik puan','4'],['6+ puan','44%'],['P90','14.0']].map(([label,value])=>'<div><span>'+label+'</span><b>'+value+'</b></div>').join('')+'</div>'
              host.appendChild(card)
            }
            document.querySelector('main')?.appendChild(host)
          })
        }
        const data=await page.evaluate(()=>{
          const viewportWidth=document.documentElement.clientWidth
          const body=document.body
          const html=document.documentElement
          const docWidth=Math.max(html.scrollWidth,body?.scrollWidth||0)
          const allow=['.table-wrap','.desktop-player-table','.picker-list','.mobile-bottom-nav','.squad-pitch','.readonly-squad-pitch','.lineup-pitch']
          const suspects=[...document.querySelectorAll('main *')].filter(el=>{
            if(el.closest(allow.join(',')))return false
            const r=el.getBoundingClientRect()
            const st=getComputedStyle(el)
            if(st.display==='none'||st.visibility==='hidden'||r.width<3||r.height<3)return false
            return (r.right>viewportWidth+4 && r.left<viewportWidth+1)||(r.left< -4 && r.right>0)
          }).slice(0,12).map(el=>({tag:el.tagName.toLowerCase(),class:String(el.className||'').slice(0,125),text:el.textContent?.trim().slice(0,50)}))
          const cardRects=[...document.querySelectorAll('.picker-player-v3')].slice(0,12)
          const collisions=cardRects.map((card,index)=>{
            const boxes=['.picker-player-content','.picker-value.xfp','button'].map(q=>card.querySelector(q)?.getBoundingClientRect())
            if(boxes.some(x=>!x))return {index,reason:'missing group'}
            for(let a=0;a<boxes.length;a++){
              for(let b=a+1;b<boxes.length;b++){
                const x=boxes[a],y=boxes[b]
                const ix=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))
                const iy=Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top))
                if(ix>1&&iy>1)return {index,reason:'groups overlap',a,b,intersection:[ix,iy]}
              }
            }
            return null
          }).filter(Boolean)
          const playerCards=[...document.querySelectorAll('.mobile-player-card')].filter(el=>el.getBoundingClientRect().width>0)
          const playerCardCollisions=playerCards.flatMap((card,index)=>{
            const header=card.querySelector('.mobile-player-top')?.getBoundingClientRect()
            const score=card.querySelector('.mobile-xfp')?.getBoundingClientRect()
            const metrics=card.querySelector('.mobile-player-metrics')?.getBoundingClientRect()
            const name=card.querySelector('.mobile-player-name')?.getBoundingClientRect()
            if(!header||!score||!metrics||!name)return [{index,reason:'missing group'}]
            const problems=[]
            if(score.bottom>header.bottom+1||score.bottom>metrics.top-2)problems.push({index,reason:'xFP extends below header or touches metrics'})
            if(name.right>score.left+1&&name.bottom>score.top+1&&score.bottom>name.top+1)problems.push({index,reason:'name overlaps xFP'})
            return problems
          })
          return {viewportWidth,docWidth,suspects,collisions,pickerCount:cardRects.length,playerCardCount:playerCards.length,playerCardCollisions}

        })
        record.overflow=Math.max(0,data.docWidth-data.viewportWidth)
        record.suspects=data.suspects
        record.suspectCount=data.suspects.length
        record.pickerCollisions=data.collisions
        record.pickerCount=data.pickerCount
        record.playerCardCount=data.playerCardCount
        record.playerCardCollisions=data.playerCardCollisions
        if(path==='/players'&&width<=768&&data.playerCardCount<2)throw new Error('Mobile player card fixtures not visible')
        const suffix=path==='/'?'home':path.replaceAll('/','-').replace(/^-/, '')
        await page.screenshot({path:out+'/'+width+'-'+suffix+'.png',fullPage:width===390&&critical.includes(path),animations:'disabled',timeout:12000})
      }catch(e){
        record.error=String(e?.message||e).slice(0,280)
      }finally{
        all.push(record)
        await page.close().catch(()=>{})
      }
    }
    await context.close()
  }
}finally{
  await browser?.close().catch(()=>{})
  server.kill('SIGTERM')
  server.stdout?.destroy()
  server.stderr?.destroy()
}
const criticalIssues=all.filter(x=>x.overflow>4||x.pickerCollisions.length>0||x.playerCardCollisions.length>0||x.error)
const report={
  generated_at:new Date().toISOString(),
  routesChecked:all.length,
  publicOnly:true,
  note:'Protected content (authenticated squad selection, Pro, draft rooms) requires authenticated visual QA.',
  issues:criticalIssues,
  all
}
await writeFile(out+'/report.json',JSON.stringify(report,null,2))
for(const x of all)console.log([x.width,x.path,'HTTP '+x.status,'horizontal '+x.overflow+'px','potential '+x.suspectCount,'picker '+x.pickerCount,'collisions '+x.pickerCollisions.length,'player cards '+x.playerCardCount,'player card collisions '+x.playerCardCollisions.length,x.error||''].join(' | '))
console.log('RESPONSIVE AUDIT: '+all.length+' routes, '+criticalIssues.length+' flagged; artifacts: '+out)
if(criticalIssues.length)process.exitCode=1
