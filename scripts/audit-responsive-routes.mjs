/* Browser layout audit for the Sky Blue release.
 * Public routes + responsive widths: horizontal overflow, clipping candidates
 * and player picker card collisions. Runs in a GitHub-hosted Chromium browser.
 * Logged-in-only sections require a separate authenticated visual QA run.
 */
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
const viewports=[360,390,768,1280]
const out='artifacts/responsive-audit'
await mkdir(out,{recursive:true})

let logs=''
const server=spawn('npm',['start','--','-p',String(PORT)],{
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
      const record={width,path,status:null,overflow:0,suspectCount:0,suspects:[],pickerCount:0,pickerCollisions:[],error:null}
      try{
        const response=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:25000})
        record.status=response?.status()||null
        await page.waitForTimeout(350)
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
          return {viewportWidth,docWidth,suspects,collisions,pickerCount:cardRects.length}
        })
        record.overflow=Math.max(0,data.docWidth-data.viewportWidth)
        record.suspects=data.suspects
        record.suspectCount=data.suspects.length
        record.pickerCollisions=data.collisions
        record.pickerCount=data.pickerCount
        const suffix=path==='/'?'home':path.replaceAll('/','-').replace(/^-/, '')
        await page.screenshot({path:out+'/'+width+'-'+suffix+'.png',fullPage:true,animations:'disabled'})
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
}
const criticalIssues=all.filter(x=>x.overflow>4||x.pickerCollisions.length>0||x.error)
const report={
  generated_at:new Date().toISOString(),
  routesChecked:all.length,
  publicOnly:true,
  note:'Protected content (authenticated squad selection, Pro, draft rooms) requires authenticated visual QA.',
  issues:criticalIssues,
  all
}
await writeFile(out+'/report.json',JSON.stringify(report,null,2))
for(const x of all)console.log([x.width,x.path,'HTTP '+x.status,'horizontal '+x.overflow+'px','potential '+x.suspectCount,'picker '+x.pickerCount,'collisions '+x.pickerCollisions.length,x.error||''].join(' | '))
console.log('RESPONSIVE AUDIT: '+all.length+' routes, '+criticalIssues.length+' flagged; artifacts: '+out)
if(criticalIssues.length)process.exitCode=1
