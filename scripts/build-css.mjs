import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import purgecss from '@fullhuman/postcss-purgecss'
import cssnano from 'cssnano'
import {minify as cssoMinify} from 'csso'

const SOURCE_CSS=[
  'components/SiteShell.module.css',
  'components/PremiumViews.module.css',
  'components/SquadWorkspace.module.css',
  'components/AnalysisViews.module.css',
  'components/DataViews.module.css',
]

function walkJs(dir){
  if(!fs.existsSync(dir))return []
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name)
    return entry.isDirectory()?walkJs(full):(entry.isFile()&&full.endsWith('.js')?[path.normalize(full)]:[])
  })
}

function unwrapGlobal(input){
  let out='',i=0
  while(i<input.length){
    const start=input.indexOf(':global(',i)
    if(start<0){out+=input.slice(i);break}
    out+=input.slice(i,start)
    let p=start+8,depth=1,quote=null,escaped=false
    for(;p<input.length;p++){
      const ch=input[p]
      if(quote){
        if(escaped)escaped=false
        else if(ch==='\\')escaped=true
        else if(ch===quote)quote=null
        continue
      }
      if(ch==='"'||ch==="'"){quote=ch;continue}
      if(ch==='(')depth++
      else if(ch===')'&&--depth===0)break
    }
    out+=input.slice(start+8,p)
    i=p+1
  }
  return out
}

function reachableJs(){
  const appFiles=walkJs('app')
  const reachable=new Set(appFiles)
  const queue=[...appFiles]
  while(queue.length){
    const file=queue.pop()
    const source=fs.readFileSync(file,'utf8')
    const imports=[
      ...source.matchAll(/(?:from\s+|import\s*)['"](@\/components\/[^'"]+|\.\.?\/[^'"]+)['"]/g)
    ].map(match=>match[1])
    for(const spec of imports){
      let candidate=null
      if(spec.startsWith('@/components/'))candidate=path.join('components',spec.slice('@/components/'.length))
      else if(spec.startsWith('.'))candidate=path.resolve(path.dirname(file),spec)
      if(!candidate)continue
      const variants=[candidate,candidate+'.js',path.join(candidate,'index.js')]
      const resolved=variants.find(value=>fs.existsSync(value)&&fs.statSync(value).isFile())
      if(!resolved)continue
      const normalized=path.normalize(path.relative(process.cwd(),path.resolve(resolved)))
      if(!reachable.has(normalized)){reachable.add(normalized);queue.push(normalized)}
    }
  }
  return [...reachable]
}

const raw=SOURCE_CSS.map(file=>fs.readFileSync(file,'utf8')).join('\n')
const globalized=unwrapGlobal(raw).split('.scope').join('')
const contentFiles=reachableJs()
const runtimeStrings=contentFiles.map(file=>{
  const source=fs.readFileSync(file,'utf8')
  return [...source.matchAll(/["'`]([^"'`]{1,1000})["'`]/g)].map(match=>match[1]).join(' ')
}).join(' ')

const purged=await postcss([
  purgecss({
    content:[{raw:runtimeStrings,extension:'html'}],
    safelist:{
      standard:[
        'active','compact','recommended','alternative','warning','critical',
        'good','neutral','tough','high','medium','low','edge','G','B','M',
        'GK','DEF','MID','FWD','is-return','is-emphasis',
        'historical_frozen','live_frozen','reconstructed','preseason_replay',
        'closed','replay_pending','cold_start_gap','bias-up','bias-down',
        /^position-(gk|def|mid|fwd)$/i,
      ],
    },
  }),
]).process(globalized,{from:undefined})

const minified=await postcss([cssnano({preset:'default'})]).process(purged.css,{from:undefined})
const output=cssoMinify(minified.css,{restructure:true}).css
fs.writeFileSync('app/generated.css',output+'\n')

console.log(
  'CSS build:',
  'sources='+SOURCE_CSS.length,
  'content='+contentFiles.length,
  'raw='+Buffer.byteLength(raw),
  'purged='+Buffer.byteLength(purged.css),
  'final='+Buffer.byteLength(output)
)
